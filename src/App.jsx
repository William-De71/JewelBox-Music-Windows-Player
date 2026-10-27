import { useApp } from './app/context.jsx';
import { useDesktopIntegration } from './app/desktop.jsx';
import { NavPane } from './ui/NavPane.jsx';
import { Icon } from './ui/Icon.jsx';
import { PlayerBar } from './ui/PlayerBar.jsx';
import { AlbumDetailPage } from './pages/AlbumDetailPage.jsx';
import { FullPlayerPage } from './pages/FullPlayerPage.jsx';
import { HomePage } from './pages/HomePage.jsx';
import { LibraryPage } from './pages/LibraryPage.jsx';
import { PlaylistDetailPage } from './pages/PlaylistDetailPage.jsx';
import { PlaylistsPage } from './pages/PlaylistsPage.jsx';
import { SearchPage } from './pages/SearchPage.jsx';
import { SettingsPage } from './pages/SettingsPage.jsx';
import { SmartPlaylistDetailPage } from './pages/SmartPlaylistDetailPage.jsx';

const TAB_PAGES = {
  home: () => <HomePage />,
  library: () => <LibraryPage />,
  search: () => <SearchPage />,
  playlists: () => <PlaylistsPage />,
  settings: () => <SettingsPage />,
};

// Fiches empilées par-dessus un onglet.
const STACK_PAGES = {
  album: (page) => <AlbumDetailPage albumId={page.id} />,
  playlist: (page) => <PlaylistDetailPage playlistId={page.id} />,
  smart: (page) => <SmartPlaylistDetailPage smartKey={page.id} />,
  player: () => <FullPlayerPage />,
};

export function App() {
  const { navigation } = useApp();
  useDesktopIntegration();
  const page = navigation.page;
  const content = page ? STACK_PAGES[page.kind]?.(page) : TAB_PAGES[navigation.tab]();

  return (
    <div class="window">
      <div class="shell">
        <NavPane />
        <main class="content">
          {navigation.canGoBack && (
            <div class="content__toolbar">
              <fluent-button appearance="subtle" icon-only aria-label="Retour" title="Retour (Échap)" onClick={navigation.pop}>
                <Icon name="arrow_left" />
              </fluent-button>
            </div>
          )}
          <div class="content__scroll" key={page ? `${page.kind}-${page.id ?? ''}-${navigation.depth}` : navigation.tab}>{content}</div>
        </main>
      </div>
      {/* Le grand lecteur occupe la page : la barre du bas se masque. */}
      {page?.kind !== 'player' && <PlayerBar onOpenFullPlayer={() => navigation.push({ kind: 'player' })} />}
    </div>
  );
}
