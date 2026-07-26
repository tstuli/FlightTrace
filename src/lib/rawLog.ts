export type RawLogData = Blob | Uint8Array<ArrayBuffer>

export function rawLogBlob(data: RawLogData): Blob {
  return data instanceof Blob ? data : new Blob([data], { type: 'text/csv' })
}

export async function rawLogBytes(data: RawLogData): Promise<Uint8Array<ArrayBuffer>> {
  if (data instanceof Uint8Array) return new Uint8Array(data)
  return new Uint8Array(await data.arrayBuffer())
}
