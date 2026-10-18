import bpy,json,os,shutil
from mathutils import Vector
s=bpy.context.scene;folder=os.path.dirname(bpy.data.filepath)
backup=folder+'/lc3-campus-layout-before-text-removal.blend'
if not os.path.exists(backup):shutil.copy2(bpy.data.filepath,backup)
inv=json.load(open(folder+'/svg-audit-inventory.json',encoding='utf8'))
text_sources={'F%s_SVG_%03d'%(f,r['index']) for f,rows in inv.items() for r in rows if r['tag']=='path' and r['svg'].get('fill') in ['black','#111111']}
remove=[o for o in s.objects if o.type=='FONT' or o.get('assembly_source_name') in text_sources]
removed=[o.name for o in remove]
if not removed and os.path.exists(folder+'/lc3-campus-ready-manifest.json'):removed=json.load(open(folder+'/lc3-campus-ready-manifest.json',encoding='utf8'))['removed_text_objects']
for ob in remove:
 assert len(ob.users_scene)==1,'Shared object requires scene-only cleanup: '+ob.name
 bpy.data.objects.remove(ob,do_unlink=True)
assert not any(o.type=='FONT' or o.get('assembly_source_name') in text_sources for o in s.objects)
print('Removed text objects',len(removed))
# Export complete model collections even when a floor was temporarily hidden for inspection.
export_layer_state=[]
def enable_export_layers(layer):
 export_layer_state.append((layer,layer.exclude,layer.hide_viewport))
 layer.exclude=False;layer.hide_viewport=False
 for child in layer.children:enable_export_layers(child)
for layer in bpy.context.view_layer.layer_collection.children:
 if layer.name.startswith(('00 | SITE','10 | LC3','20 | LC3','30 | STAIRS','80 | SURROUNDING')):enable_export_layers(layer)
for ob in s.objects:
 if ob.type in ['MESH','CURVE'] and ob.hide_render:ob.hide_set(True)
bpy.context.view_layer.update();deps=bpy.context.evaluated_depsgraph_get()
colgroups=[('10 | LC3 - FLOOR 1','LC3_Floor_1'),('20 | LC3 - FLOOR 2 - toggle','LC3_Floor_2'),('30 | STAIRS - F1 to F2','LC3_Connecting_Stairs'),('00 | SITE - exterior ground','Site_Ground')]
sets={name:set(bpy.data.collections[c].all_objects) for c,name in colgroups}
ctx=bpy.data.collections['80 | SURROUNDING BUILDINGS']
covered=next((c for c in ctx.children if c.name.startswith('83')),None)
sets['Covered_Link']=set(covered.all_objects) if covered else set()
sets['Surrounding_Buildings']=set(ctx.all_objects)-sets['Covered_Link']
batches={name:{'vertices':[],'faces':[],'face_normals':{},'material_indices':[],'materials':[],'material_map':{},'source_objects':0,'room_metadata':[]} for name in sets}
runtime_materials={}
visible=[o for o in s.objects if o.type in ['MESH','CURVE','SURFACE','META'] and o.visible_get() and not o.hide_render]
for ob in visible:
 group=next((name for name,obs in sets.items() if ob in obs),None)
 if group is None:raise RuntimeError('Unassigned runtime geometry: '+ob.name)
 ev=ob.evaluated_get(deps);mesh=ev.to_mesh(preserve_all_data_layers=True,depsgraph=deps)
 if not mesh or not mesh.polygons:
  ev.to_mesh_clear();continue
 b=batches[group];offset=len(b['vertices']);zorigin=3.2 if group=='LC3_Floor_2' else 0
 b['vertices'].extend(tuple(ev.matrix_world@v.co+Vector((34,0,-zorigin))) for v in mesh.vertices)
 material_mapping={}
 for i,mat in enumerate(mesh.materials):
  if not mat:continue
  # Identical shader values share a runtime material.
  shader=next((n for n in mat.node_tree.nodes if n.type=='BSDF_PRINCIPLED'),None) if mat.use_nodes else None
  if shader is None:
   original=mat
   if original.name not in runtime_materials:
    legacy=next((n for n in original.node_tree.nodes if n.type=='BSDF_DIFFUSE'),None) if original.use_nodes else None
    color=tuple(legacy.inputs['Color'].default_value) if legacy else tuple(original.diffuse_color)
    color=(*color[:3],1.0)
    converted=bpy.data.materials.new('Runtime_PBR_'+original.name);converted.use_nodes=True;converted.diffuse_color=color
    bsdf=next(n for n in converted.node_tree.nodes if n.type=='BSDF_PRINCIPLED');bsdf.inputs['Base Color'].default_value=color;bsdf.inputs['Alpha'].default_value=color[3];bsdf.inputs['Roughness'].default_value=1;bsdf.inputs['Specular IOR Level'].default_value=0
    runtime_materials[original.name]=converted
   mat=runtime_materials[original.name];shader=next(n for n in mat.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
  props=['Base Color','Metallic','Roughness','Alpha','Transmission Weight','Emission Color','Emission Strength']
  values=[]
  for prop in props:
   value=shader.inputs[prop].default_value if shader and prop in shader.inputs else 0
   values.append(tuple(round(float(x),5) for x in value) if hasattr(value,'__len__') else round(float(value),5))
  key=tuple(values)
  if key not in b['material_map']:b['material_map'][key]=len(b['materials']);b['materials'].append(mat)
  material_mapping[i]=b['material_map'][key]
 normal_matrix=ev.matrix_world.to_3x3().inverted().transposed()
 for face in mesh.polygons:
  vertices=tuple(offset+i for i in face.vertices)
  b['faces'].append(vertices);b['material_indices'].append(material_mapping.get(face.material_index,0))
  b['face_normals'][vertices]=[tuple((normal_matrix@mesh.corner_normals[i].vector).normalized()) for i in face.loop_indices]
 b['source_objects']+=1
 if ob.get('room_codes'):
  pts=[ob.matrix_world@Vector(v) for v in ob.bound_box]
  center=[(min(v[i] for v in pts)+max(v[i] for v in pts))/2 for i in range(3)];center[0]+=34
  b['room_metadata'].append({'codes':ob['room_codes'],'center_blender_z_up':center,'source_object':ob.name})
 ev.to_mesh_clear()
exportscene=bpy.data.scenes.new('LC3_RUNTIME_EXPORT_TEMP')
for name,b in batches.items():
 if not b['faces']:continue
 mesh=bpy.data.meshes.new(name+'_Runtime');mesh.from_pydata(b['vertices'],[],b['faces']);mesh.update()
 for mat in b['materials']:mesh.materials.append(mat)
 for poly,index in zip(mesh.polygons,b['material_indices']):poly.material_index=index
 repaired=mesh.validate(clean_customdata=True);mesh.update();print('Mesh validation',name,'repaired',repaired)
 # Preserve evaluated split normals, including bevels and smooth fountain/foliage.
 # Rebuilding meshes without them made the previous GLB completely flat-shaded.
 normals=[];fallback=0
 for poly in mesh.polygons:
  source=b['face_normals'].get(tuple(poly.vertices))
  if source is None:source=[tuple(poly.normal)]*len(poly.vertices);fallback+=1
  normals.extend(source);poly.use_smooth=True
 mesh.normals_split_custom_set(normals)
 print('Preserved corner normals',len(normals),'fallback faces',fallback)
 ob=bpy.data.objects.new(name,mesh);exportscene.collection.objects.link(ob)
 if name=='LC3_Floor_2':ob.location.z=3.2
 ob['part']=name;ob['text_free']=True
 if name.startswith('LC3_Floor_'):ob['floor']=int(name[-1])
 print(name,'source',b['source_objects'],'vertices',len(b['vertices']),'faces',len(b['faces']),'materials',len(b['materials']))
oldscene=bpy.context.window.scene
try:
 bpy.context.window.scene=exportscene
 result=bpy.ops.export_scene.gltf(filepath=folder+'/lc3-campus-ready.glb',export_format='GLB',use_active_scene=True,export_cameras=False,export_lights=False,export_extras=True,export_animations=False,export_yup=True)
 assert 'FINISHED' in result
finally:
 bpy.context.window.scene=oldscene
 for ob in list(exportscene.objects):
  data=ob.data;bpy.data.objects.remove(ob,do_unlink=True)
  if data.users==0:bpy.data.meshes.remove(data)
 bpy.data.scenes.remove(exportscene)
 for material in runtime_materials.values():
  if material.users==0:bpy.data.materials.remove(material)
 for layer,excluded,hidden in export_layer_state:
  layer.exclude=excluded;layer.hide_viewport=hidden
 for ob in s.objects:
  if ob.type in ['MESH','CURVE'] and ob.hide_render:ob.hide_set(True)
 bpy.context.view_layer.update()
json.dump({'removed_text_objects':removed,'origin_world_blender':[-34,0,0],'gltf_up_axis':'Y','parts':[{ 'name':name,'source_objects':b['source_objects'],'materials':len(b['materials']),'room_metadata':b['room_metadata']} for name,b in batches.items()]},open(folder+'/lc3-campus-ready-manifest.json','w',encoding='utf8'),ensure_ascii=False,indent=2)
state={'camera':s.camera.name,'x':s.render.resolution_x,'y':s.render.resolution_y,'path':s.render.filepath}
s.camera=bpy.data.objects['LC3_Exterior_Walls_Overview'];s.render.resolution_x=1800;s.render.resolution_y=1200;s.render.filepath=folder+'/lc3-campus-text-free.png'
bpy.ops.render.render(write_still=True)
s.camera=bpy.data.objects[state['camera']];s.render.resolution_x=state['x'];s.render.resolution_y=state['y'];s.render.filepath=state['path']
bpy.ops.wm.save_as_mainfile(filepath=bpy.data.filepath)
print('Saved blend and GLB',os.path.getsize(folder+'/lc3-campus-ready.glb'))



