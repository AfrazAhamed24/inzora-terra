import os

print('=== STRUCTURAL AUDIT ===')
print()

# Check App.jsx return structure
app_path = 'C:/Users/afraz ahamed k m/Downloads/project catalyst/frontend/src/App.jsx'
app_content = open(app_path).read()

imports = ['Nav', 'HeroSection', 'DashboardSection', 'AgentSection', 'KnowledgeSection', 'TimelineSection', 'DexterStatus', 'TerraX', 'BootSequence', 'MissionEngineStatus', 'HITLGate']
import_status = {}
for imp in imports:
    import_status[imp] = 'import ' + imp in app_content

print('1. App.jsx Imports:')
for k, v in import_status.items():
    marker = '✅' if v else '❌'
    print(f'   {marker} {k}')

# Check return structure
print()
print('2. App.jsx Return Structure:')
markers = {}
markers['StrictMode'] = '✅' if 'StrictMode' in app_content else '❌'
markers['MissionProvider'] = '✅' if 'MissionProvider' in app_content else '❌'
markers['AppInner'] = '✅' if 'AppInner' in app_content else '❌'
markers['main tag'] = '✅' if '<main>' in app_content else '❌'
markers['HeroSection'] = '✅' if 'HeroSection' in app_content else '❌'
markers['DashboardSection'] = '✅' if 'DashboardSection' in app_content else '❌'

for k, v in markers.items():
    print(f'   {k}: {v}')

# Check index.css has tailwind
css_path = 'C:/Users/afraz ahamed k m/Downloads/project catalyst/frontend/src/index.css'
css_content = open(css_path).read()
print()
print('3. index.css Tailwind:')
tw_markers = {}
tw_markers['@tailwind base'] = '✅' if '@tailwind base' in css_content else '❌'
tw_markers['@tailwind components'] = '✅' if '@tailwind components' in css_content else '❌'
tw_markers['@tailwind utilities'] = '✅' if '@tailwind utilities' in css_content else '❌'

for k, v in tw_markers.items():
    print(f'   {k}: {v}')

# Check components exist and export
components_dir = 'C:/Users/afraz ahamed k m/Downloads/project catalyst/frontend/src/components'
component_files = [f for f in os.listdir(components_dir) if f.endswith('.jsx')]
print()
print('4. Components:')
comp_status = {}
for cf in component_files:
    try:
        c = open(os.path.join(components_dir, cf)).read()
        has_export = 'export default' in c
        has_return = 'return(' in c or 'return ' in c
        comp_status[cf] = {'export': has_export, 'return': has_return}
    except:
        comp_status[cf] = {'export': False, 'return': False}

for cf, status in comp_status.items():
    ex_marker = '✅' if status['export'] else '❌'
    re_marker = '✅' if status['return'] else '❌'
    print(f'   {cf}: export={ex_marker}, return={re_marker}')

print()
print('=== AUDIT COMPLETE ===')