/**
 * Hands a file the user just picked from the device to the scanner screen.
 *
 * The Upload button in the bottom bar opens the phone's native picker straight
 * away, while the user is still on their vaults screen. Once a file is chosen
 * we navigate to the scanner, but a File object cannot travel in a URL, so it
 * is parked here for the moment between the picker closing and the scanner
 * mounting. This is what lets Upload work with no intermediate in-app screen.
 *
 * It is a deliberate module-level single slot: only one upload can be in
 * flight at a time, and the value is cleared as soon as it is read.
 */
let pendingFile: File | null = null;

export function setPendingUpload(file: File) {
  pendingFile = file;
}

/** Returns the parked file (if any) and clears the slot. */
export function takePendingUpload(): File | null {
  const file = pendingFile;
  pendingFile = null;
  return file;
}
