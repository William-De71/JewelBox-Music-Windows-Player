// Côté natif de JewelBox pour Windows : la fenêtre (effet Mica, réglé dans
// tauri.conf.json), l'icône de la zone de notification et les quelques
// services que le WebView ne fournit pas.

use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager};

const TRAY_ID: &str = "main";

/// Nom de la machine, pour le libellé de l'appareil vu par les autres
/// lecteurs (« JewelBox Windows · <nom> »). Vide si introuvable.
#[tauri::command]
fn device_hostname() -> String {
    hostname_from(
        std::env::var("COMPUTERNAME").ok(),
        std::env::var("HOSTNAME").ok(),
        std::fs::read_to_string("/etc/hostname").ok(),
    )
}

fn hostname_from(computer: Option<String>, host: Option<String>, file: Option<String>) -> String {
    [computer, host, file]
        .into_iter()
        .flatten()
        .map(|name| name.trim().to_string())
        .find(|name| !name.is_empty())
        .unwrap_or_default()
}

/// Quitte vraiment l'application (menu de la zone de notification, Ctrl+Q,
/// fin de la lecture en arrière-plan) ; la page a déjà enregistré la file.
#[tauri::command]
fn quit_app(app: AppHandle) {
    app.exit(0);
}

/// Fond de fenêtre disponible : « mica » sous Windows 11 (build 22000 et
/// plus), sinon « none » — la page peint alors son propre fond, faute de
/// quoi la fenêtre transparente laisserait voir le bureau (Windows 10).
#[tauri::command]
fn window_backdrop() -> &'static str {
    backdrop_for(windows_build())
}

#[cfg(windows)]
fn windows_build() -> Option<u32> {
    Some(windows_version::OsVersion::current().build)
}

#[cfg(not(windows))]
fn windows_build() -> Option<u32> {
    None
}

fn backdrop_for(build: Option<u32>) -> &'static str {
    match build {
        Some(build) if build >= 22000 => "mica",
        _ => "none",
    }
}

/// Infobulle de l'icône : la piste en cours, ou le nom de l'application.
#[tauri::command]
fn set_tray_tooltip(app: AppHandle, text: String) {
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        let _ = tray.set_tooltip(Some(tray_tooltip(&text)));
    }
}

/// Windows tronque les infobulles de la zone de notification à 127 caractères.
fn tray_tooltip(text: &str) -> String {
    let text = text.trim();
    if text.is_empty() {
        return "JewelBox Music Player".to_string();
    }
    if text.chars().count() <= 127 {
        return text.to_string();
    }
    let mut cut: String = text.chars().take(126).collect();
    cut.push('…');
    cut
}

fn show_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
        let _ = app.emit("window-shown", ());
    }
}

fn build_tray(app: &AppHandle) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, "show", "Afficher JewelBox", true, None::<&str>)?;
    let toggle = MenuItem::with_id(app, "play-pause", "Lecture / pause", true, None::<&str>)?;
    let next = MenuItem::with_id(app, "next", "Suivant", true, None::<&str>)?;
    let previous = MenuItem::with_id(app, "previous", "Précédent", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quitter", true, None::<&str>)?;
    let separator = PredefinedMenuItem::separator(app)?;
    let separator2 = PredefinedMenuItem::separator(app)?;
    let menu = Menu::with_items(app, &[&show, &separator, &toggle, &previous, &next, &separator2, &quit])?;

    let mut builder = TrayIconBuilder::with_id(TRAY_ID)
        .tooltip("JewelBox Music Player")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => show_main_window(app),
            // Lecture et sortie passent par la page : elle pilote la session
            // et enregistre la file avant de quitter.
            action => {
                let _ = app.emit("tray-action", action.to_string());
            }
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                show_main_window(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }
    builder.build(app)?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Relancer l'application ramène la fenêtre existante (peut-être
        // masquée pendant une lecture en arrière-plan) au lieu d'en ouvrir
        // une seconde qui jouerait par-dessus.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| show_main_window(app)))
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            build_tray(app.handle())?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![device_hostname, quit_app, set_tray_tooltip, window_backdrop])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::{backdrop_for, hostname_from, tray_tooltip};

    #[test]
    fn mica_only_on_windows_11() {
        assert_eq!(backdrop_for(Some(22631)), "mica");
        assert_eq!(backdrop_for(Some(22000)), "mica");
        assert_eq!(backdrop_for(Some(19045)), "none");
        assert_eq!(backdrop_for(None), "none");
    }

    #[test]
    fn prefers_windows_computer_name() {
        let name = hostname_from(Some("PC-SALON".into()), Some("autre".into()), None);
        assert_eq!(name, "PC-SALON");
    }

    #[test]
    fn skips_blank_values() {
        let name = hostname_from(Some("  ".into()), None, Some("njord\n".into()));
        assert_eq!(name, "njord");
    }

    #[test]
    fn empty_when_unknown() {
        assert_eq!(hostname_from(None, None, None), "");
    }

    #[test]
    fn tooltip_defaults_to_the_app_name() {
        assert_eq!(tray_tooltip("  "), "JewelBox Music Player");
    }

    #[test]
    fn tooltip_is_cut_to_the_windows_limit() {
        let long = "é".repeat(200);
        let tooltip = tray_tooltip(&long);
        assert_eq!(tooltip.chars().count(), 127);
        assert!(tooltip.ends_with('…'));
        assert_eq!(tray_tooltip("Sexy Boy — Air"), "Sexy Boy — Air");
    }
}
