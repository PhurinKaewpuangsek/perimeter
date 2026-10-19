import bpy
# Restyles the east (fountain) courtyard to match the 2D floor plan: grey ground, brown-grey walkways
# and fountain ring, cyan water, no shrubs on the walkways. Run once from the Scripting tab before
# prepare_architectural_export.py. The west courtyard shares the source materials, so they are copied.
def linear(h):
 c=[int(h[i:i+2],16)/255 for i in (1,3,5)]
 return tuple(x/12.92 if x<=.04045 else ((x+.055)/1.055)**2.4 for x in c)+(1.0,)
def material(name,source,h):
 m=bpy.data.materials.get(name)
 if not m:m=bpy.data.materials[source].copy();m.name=name
 c=linear(h);m.diffuse_color=c
 for n in m.node_tree.nodes if m.use_nodes else []:
  if n.type in ('BSDF_PRINCIPLED','BSDF_DIFFUSE'):
   assert not n.inputs[0].is_linked,name;n.inputs[0].default_value=c
 return m
ground=material('Finish | East courtyard | ground','Finish | LC3 | open ground green','#D9D9D9')
walk=material('Finish | East courtyard | walkway','Finish | LC3 | planted courtyard green','#A29393')
water=material('Finish | East courtyard | fountain water','Finish | Fountain | water indication','#0CC0DF')
paint={ground:['F1_SVG_002.001'],
 walk:['F1_SVG_218.001','F1_SVG_019.001','F1_SVG_029.001','F1_SVG_217.001','F1_SVG_222.001','Fountain_Rim_Coping','Fountain_Circular_Basin_Wall'],
 water:['Fountain_Water_Surface','Fountain_Basin_Base','Fountain_Head_Water','Fountain_Ripple_00','Fountain_Ripple_01','Fountain_Ripple_02']}
for m,names in paint.items():
 for n in names:
  o=bpy.data.objects[n];assert o.data.users==1,'Shared data would restyle another object: '+n
  for slot in o.material_slots:slot.material=m
for i in range(10,16):
 o=bpy.data.objects['Garden_Shrub_%d'%i];o.hide_render=True;o.hide_set(True)
print('Restyled east courtyard')
bpy.ops.wm.save_as_mainfile(filepath=bpy.data.filepath)
