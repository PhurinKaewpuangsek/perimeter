// Compresses the Blender export for the web: node compress_glb.mjs <in.glb> <out.glb>
// Needs: npm i --no-save @gltf-transform/core@4.1.1 @gltf-transform/extensions@4.1.1 @gltf-transform/functions@4.1.1 meshoptimizer@0.22.0
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions'
import { quantize, reorder } from '@gltf-transform/functions'
import { MeshoptEncoder } from 'meshoptimizer'
await MeshoptEncoder.ready
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder })
const doc = await io.read(process.argv[2])
// Positions stay float: floor finishes sit < 1 mm apart, finer than any 16-bit grid over a floor.
await doc.transform(reorder({ encoder: MeshoptEncoder }), quantize({ pattern: /^NORMAL$/, quantizeNormal: 10 }))
doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.FILTER })
await io.write(process.argv[3], doc)
