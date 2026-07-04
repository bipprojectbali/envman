export interface CollectedFile {
  file: File
  path: string
}

function readAllEntries(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  return new Promise((resolve, reject) => {
    const all: FileSystemEntry[] = []
    function read() {
      reader.readEntries((entries) => {
        if (entries.length === 0) resolve(all)
        else { all.push(...entries); read() }
      }, reject)
    }
    read()
  })
}

function fileFromEntry(entry: FileSystemFileEntry): Promise<File> {
  return new Promise((resolve, reject) => entry.file(resolve, reject))
}

export async function collectFilesFromEntry(entry: FileSystemEntry, prefix: string): Promise<CollectedFile[]> {
  if (entry.isFile) {
    const file = await fileFromEntry(entry as FileSystemFileEntry)
    return [{ file, path: prefix ? `${prefix}/${entry.name}` : entry.name }]
  }
  const dir = entry as FileSystemDirectoryEntry
  const entries = await readAllEntries(dir.createReader())
  const nested = await Promise.all(
    entries.map((e) => collectFilesFromEntry(e, prefix ? `${prefix}/${dir.name}` : dir.name))
  )
  return nested.flat()
}

// Convert files from <input webkitdirectory> — webkitRelativePath already has the folder structure.
export function filesFromInput(files: File[]): CollectedFile[] {
  return files.map((f) => ({ file: f, path: f.webkitRelativePath || f.name }))
}
