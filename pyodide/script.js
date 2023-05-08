importScripts("https://cdn.jsdelivr.net/pyodide/v0.22.1/full/pyodide.js");

function sendPatch(patch, buffers, msg_id) {
  self.postMessage({
    type: 'patch',
    patch: patch,
    buffers: buffers
  })
}

async function startApplication() {
  console.log("Loading pyodide!");
  self.postMessage({type: 'status', msg: 'Loading pyodide'})
  self.pyodide = await loadPyodide();
  self.pyodide.globals.set("sendPatch", sendPatch);
  console.log("Loaded!");
  await self.pyodide.loadPackage("micropip");
  const env_spec = ['https://cdn.holoviz.org/panel/0.14.3/dist/wheels/bokeh-2.4.3-py3-none-any.whl', 'https://cdn.holoviz.org/panel/0.14.3/dist/wheels/panel-0.14.3-py3-none-any.whl', 'pyodide-http==0.1.0', 'PIL', 'cv2', 'extcolors', 'matplotlib', 'pandas']
  for (const pkg of env_spec) {
    let pkg_name;
    if (pkg.endsWith('.whl')) {
      pkg_name = pkg.split('/').slice(-1)[0].split('-')[0]
    } else {
      pkg_name = pkg
    }
    self.postMessage({type: 'status', msg: `Installing ${pkg_name}`})
    try {
      await self.pyodide.runPythonAsync(`
        import micropip
        await micropip.install('${pkg}');
      `);
    } catch(e) {
      console.log(e)
      self.postMessage({
	type: 'status',
	msg: `Error while installing ${pkg_name}`
      });
    }
  }
  console.log("Packages loaded!");
  self.postMessage({type: 'status', msg: 'Executing code'})
  const code = `
  
import asyncio

from panel.io.pyodide import init_doc, write_doc

init_doc()

import panel as pn
from panel.template.base import _base_config
from PIL import Image
import pandas as pd
import matplotlib.pyplot as plt
import matplotlib.patches as patches
import matplotlib.image as mpimg
import cv2
import extcolors
import colorsys
import warnings
warnings.simplefilter(action='ignore', category=FutureWarning)

def rgb2hex(r,g,b):
    return '#{:02x}{:02x}{:02x}'.format(r, g, b)

def color_to_df(input):
    color_df = pd.DataFrame(input[0], columns = ['val', 'inc'])
    color_df['r'], color_df['b'], color_df['g'] = color_df.val.str
    color_df['hsv'] = [colorsys.rgb_to_hsv(color_df['r'][i]/255, color_df['b'][i]/255, color_df['g'][i]/255) for i in color_df.index]
    color_df['h'], color_df['s'], color_df['v'] = color_df.hsv.str
    color_df['hue_angle'] = color_df['h']*360
    color_df['c_code']=[rgb2hex(color_df['r'][i], color_df['b'][i], color_df['g'][i]) for i in color_df.index]
    color_df['approved'] = color_df['hue_angle'].map(lambda x: "Yes" if (x>= 76) & (x<=225) else "No")                                           
    return color_df[['c_code','hue_angle', 's','v','approved']]

def extract_color(input_image, resize, tolerance):
    '''function takes an image file and several parameters, and returns a list of the colors detected in the image''' 
    #background
    bg = 'bg.png'
    fig, ax = plt.subplots(figsize=(192,108),dpi=10)
    fig.set_facecolor('white')
    plt.savefig(bg)
    plt.close(fig)

    #resize
    output_width = resize
    img = Image.open(input_image)
    if img.size[0] >= resize:
        wpercent = (output_width/float(img.size[0]))
        hsize = int((float(img.size[1])*float(wpercent)))
        img = img.resize((output_width,hsize), Image.LANCZOS)
        resize_name = 'resize_'+ input_image
        img.save(resize_name)
    else:
        resize_name = input_image

    #crate dataframe
    img_url = resize_name
    colors_x = extcolors.extract_from_path(img_url, tolerance = tolerance, limit=12)
    df_color = color_to_df(colors_x)

    #color palette

    bg = plt.imread('bg.png')
    fig = plt.figure(figsize=(90, 90), dpi = 10)
    ax = fig.add_subplot(1,1,1)

    list_color = list(df_color['c_code'])
    x_posi, y_posi, y_posi2 = 320, 25, 25    

    #Update the labels to instead of showing the hex code, show the Approval value
    #Update to include a title/header

    for c in list_color:
        if  list_color.index(c) <= 5:
            y_posi += 125
            rect = patches.Rectangle((x_posi, y_posi), 290, 115, facecolor = c)
            ax.add_patch(rect)
            ax.text(x = x_posi+360, y = y_posi+80, s = c, fontdict={'fontsize': 150})
        else:
            y_posi2 += 125
            rect = patches.Rectangle((x_posi + 800, y_posi2), 290, 115, facecolor = c)
            ax.add_artist(rect)
            ax.text(x = x_posi+1160, y = y_posi2+80, s = c, fontdict={'fontsize': 150})

    ax.axis('off')
    plt.imshow(bg)       
    plt.tight_layout()
    plt.close()
    return fig    

def validate_options(event=None):
    #get values from inputs
    sleeve = sleeve_length.value 
    neck = neckline.value
    outer = outer_layer.value
    hem = bottom_length.value

    #logic to evaluate outfit
    issue_list = []
    if sleeve in ['Long', '3/4 length']:
        s=1
    elif sleeve in ['Short', 'Cap', 'None']:
        if outer=="True":
            s=1
        else: 
            s=0
            issue_list.append("Shoulders and biceps need to be covered. Please adjust your plan.")
    else:
        s=0
        issue_list.append("Shoulders and biceps need to be covered. Please adjust your plan.")

    if neck in ['Deep V', 'Other']:
        n=0
        issue_list.append("Modest necklines are required. If you chose 'Other', please confirm with leadership about your planned outfit.")
    else:
        n=1

    if hem in ['Mid-thigh', 'Knee']:
        h=0
        issue_list.append("Hem lines need to be at the knee or lower. If you chose 'Knee', please confirm with leadership about your planned outfit.")
    else:
        h=1

    if s+n+h==3:
        response = "Looking good!"
    else:
        response = '<br>'.join(map(str,issue_list))

    output_response.value = response

    if color_check.value is not None:
        i_fn = 'image.'+color_check.mime_type.split('/')[1]
        color_check.save(i_fn)
        figure = extract_color(i_fn, 900, 12)
        pallette.object=figure

sleeve_length = pn.widgets.RadioBoxGroup(name='Sleeve length', options=['Long', '3/4 length', 'Short', 'Cap', 'None'], inline=False)
neckline = pn.widgets.RadioBoxGroup(name='Neckline', options=['Collared', 'Scoop', 'Modest V', 'Deep V', 'Other'], inline=False)
outer_layer = pn.widgets.RadioBoxGroup(name='Outer layer?', options=['True', 'False'], inline=True)
bottom_length = pn.widgets.RadioBoxGroup(name='Bottom length', options=['Mid-thigh', 'Knee', 'Mid-calf', 'Ankle'], inline=False)
color_check = pn.widgets.FileInput(accept='.png,.jpg')
evaluate_button = pn.widgets.Button(name="Evaluate outfit parameters", button_type = "primary")
output_response = pn.widgets.StaticText(name="Your outfit", value='')
fig0 = plt.figure()
plt.close()
pallette = pn.pane.Matplotlib(fig0, tight=True, sizing_mode="scale_height")
evaluate_button.on_click(validate_options)

layout = pn.Column(
                pn.Row(pn.Column("<b>Attributes of Top of Outfit</b>", 
                                 "Sleeve length", sleeve_length, "Neckline", neckline, 
                                 "Are you planning to wear an outer layer (cardigan/sweater)?", outer_layer),
                       pn.Column("<b>Attributes of Bottom of Outfit</b>", 
                                 "Where does the hemline of the bottom of your outfit hit?", bottom_length,
                                 pn.Spacer(), pn.Spacer(), pn.Spacer(),
                                 "<b>Non-neutral color checking</b>",
                                 "Upload a jpg or png file with a picture of the blue and green colors you plan on wearing for a color pallette check.", color_check)
                      ), 
                pn.Row(evaluate_button, output_response),
                pn.Spacer(), pn.Spacer(),
                pn.Row(pallette)
        )

pn.template.FastListTemplate(
    title = "Voices of Symphony Tacoma Dress Code Validation", header_background="#00C3CC", theme_toggle=False,
    accent_base_color = "#00C3CC",
    main = ["This page will help you confirm if you outfit choices fit within the parameters for our new dress code.",
            layout,
           ], main_max_width='300px',).servable()

await write_doc()
  `

  try {
    const [docs_json, render_items, root_ids] = await self.pyodide.runPythonAsync(code)
    self.postMessage({
      type: 'render',
      docs_json: docs_json,
      render_items: render_items,
      root_ids: root_ids
    })
  } catch(e) {
    const traceback = `${e}`
    const tblines = traceback.split('\n')
    self.postMessage({
      type: 'status',
      msg: tblines[tblines.length-2]
    });
    throw e
  }
}

self.onmessage = async (event) => {
  const msg = event.data
  if (msg.type === 'rendered') {
    self.pyodide.runPythonAsync(`
    from panel.io.state import state
    from panel.io.pyodide import _link_docs_worker

    _link_docs_worker(state.curdoc, sendPatch, setter='js')
    `)
  } else if (msg.type === 'patch') {
    self.pyodide.runPythonAsync(`
    import json

    state.curdoc.apply_json_patch(json.loads('${msg.patch}'), setter='js')
    `)
    self.postMessage({type: 'idle'})
  } else if (msg.type === 'location') {
    self.pyodide.runPythonAsync(`
    import json
    from panel.io.state import state
    from panel.util import edit_readonly
    if state.location:
        loc_data = json.loads("""${msg.location}""")
        with edit_readonly(state.location):
            state.location.param.update({
                k: v for k, v in loc_data.items() if k in state.location.param
            })
    `)
  }
}

startApplication()