import { LibraryDirectoryScreen } from '@/components/LibraryDirectoryScreen';

/** Public library discovery (no login required). */
export default function PublicLibrariesScreen() {
  return <LibraryDirectoryScreen publicMode />;
}
