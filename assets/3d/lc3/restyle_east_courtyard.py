import bpy
# Restyles the east (fountain) courtyard to match the 2D floor plan: grey ground, brown-grey walkways
# and fountain ring, flat cyan water (the ripple rings are hidden), no shrubs on the walkways. The ground
# and walkway colours are the plan's; the plan draws the fountain as one #A29393 disc, so the water colour
# #0CC0DF was chosen in #129. Run once from the Scripting tab before prepare_architectural_export.py.
# The west courtyard shares the source materials, so they are copied. Every lookup and check runs before
# the first change, so a failure leaves the open file as it was.
assert bpy.context.scene.name=='LC3 | Site assembly','Open scene LC3 | Site assembly first'
layer_state=[]
for layer in bpy.context.view_layer.layer_collection.children:
 def show(l):
  layer_state.append((l,l.exclude,l.hide_viewport));l.exclude=False;l.hide_viewport=False
  for c in l.children:show(c)
 if layer.name.startswith(('00 | SITE','10 | LC3','20 | LC3','30 | STAIRS','80 | SURROUNDING')):show(layer)
bpy.context.view_layer.update()
def linear(h):
 c=[int(h[i:i+2],16)/255 for i in (1,3,5)]
 return tuple(x/12.92 if x<=.04045 else ((x+.055)/1.055)**2.4 for x in c)+(1.0,)
def shaders(m):return [n for n in m.node_tree.nodes if n.type in ('BSDF_PRINCIPLED','BSDF_DIFFUSE')] if m.use_nodes else []
def obj(n):
 o=bpy.data.objects.get(n);assert o,'Missing object: '+n;return o
paint=[('Finish | East courtyard | ground','Finish | LC3 | open ground green','#D9D9D9',['F1_SVG_002.001']),
 ('Finish | East courtyard | walkway','Finish | LC3 | planted courtyard green','#A29393',['F1_SVG_218.001','F1_SVG_019.001','F1_SVG_029.001','F1_SVG_217.001','F1_SVG_222.001','Fountain_Rim_Coping','Fountain_Circular_Basin_Wall']),
 ('Finish | East courtyard | fountain water','Finish | Fountain | water indication','#0CC0DF',['Fountain_Water_Surface','Fountain_Basin_Base','Fountain_Head_Water'])]
hide=['Fountain_Ripple_%02d'%i for i in range(3)]+['Garden_Shrub_%d'%i for i in range(10,16)]
for name,source,h,names in paint:
 m=bpy.data.materials.get(name) or bpy.data.materials.get(source);assert m,'Missing material: '+source
 assert not any(n.inputs[0].is_linked for n in shaders(m)),'Colour is linked to a node: '+m.name
 for n in names:assert obj(n).data.users==1,'Shared data would restyle another object: '+n
for n in hide:assert obj(n).name in bpy.context.view_layer.objects,'Not in the view layer: '+n
for name,source,h,names in paint:
 m=bpy.data.materials.get(name)
 if not m:m=bpy.data.materials[source].copy();m.name=name
 c=linear(h);m.diffuse_color=c
 for n in shaders(m):n.inputs[0].default_value=c
 for n in names:
  for slot in bpy.data.objects[n].material_slots:slot.material=m
for n in hide:
 o=bpy.data.objects[n];o.hide_render=True;o.hide_set(True)
for l,excluded,hidden in layer_state:l.exclude=excluded;l.hide_viewport=hidden
print('Restyled east courtyard')
bpy.ops.wm.save_as_mainfile(filepath=bpy.data.filepath)
