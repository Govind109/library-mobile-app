import { LibraryDirectoryScreen } from '@/components/LibraryDirectoryScreen';

/** Authenticated discovery — includes contact details from libraries when published. */
export default function LibrariesTabScreen() {
  return <LibraryDirectoryScreen publicMode={false} />;
}
