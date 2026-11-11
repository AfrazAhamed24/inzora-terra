import os

print('=== CHECKING APP STRUCTURE ===')
print()

# 1. Check App.jsx
app_path = 'C:/Users/afraz ahamed k m/Downloads/project catalyst/frontend/src/App.jsx'
app_content = open(app_path).read()
print('1. App.jsx:')
print('   - Length:', len(app_content), 'chars')
print('   - Has return:', 'return' in app_content)
print('   - Has Nav:', 'Nav' in app_content)
print('   - Has HeroSection:', 'HeroSection' in app_content)
print('   - Has DashboardSection:', 'DashboardSection' in app_content)
print('   - Has main tag:', '<main>' in app_content)
print('   - Has MotionConfig:', 'MotionConfig' in app_content)
print()

# 2. Check index.css
css_path = 'C:/Users/afraz ahamed k m/Downloads/project catalyst/frontend/src/index.css'
css_content = open(css_path).read()
print('2. index.css:')
print('   - Has @tailwind base:', '@tailwind base' in css_content)
print('   - Has @tailwind components:', '@tailwind components' in css_content)
print('   - Has @tailwind utilities:', '@tailwind utilities' in css_content)
print('   - Length:', len(css_content), 'chars')
print()

# 3. Check a few key components
components = ['DashboardSection.jsx', 'HeroSection.jsx', 'Nav.jsx']
for comp in components:
    path = 'C:/Users/afraz ahamed k m/Downloads/project catalyst/frontend/src/components/' + comp
    try:
        c = open(path).read()
        print(f'3. {comp}:')
        print('   - Has return/JSX:', 'return(' in c or 'return ' in c)
        print('   - Has main content:', '<section' in c or '<div' in c)
        print('   - Size:', len(c), 'chars')
    except Exception as e:
        print(f'3. {comp}: ERROR -', e)

print()
print('=== ALL CHECKS COMPLETE ===')