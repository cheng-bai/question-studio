from pathlib import Path
import json,math
from playwright.sync_api import sync_playwright,expect
ROOT=Path(__file__).resolve().parents[1];WORK=ROOT/'.verification-work';WORK.mkdir(exist_ok=True);checks=[]
def check(s,v=True):assert v,s;checks.append(s)
def params(page,name,value):
 expect(page.locator(name)).to_be_visible()
 page.locator(name).evaluate('(el,v)=>{el.value=v;el.dispatchEvent(new Event("input",{bubbles:true}));}',value)
def backup(page,name):
 with page.expect_download() as d:page.get_by_role('button',name='备份工程',exact=True).click()
 p=WORK/name;d.value.save_as(p);return json.loads(p.read_text()),p
with sync_playwright() as p:
 b=p.chromium.launch(headless=True,channel='chrome');ctx=b.new_context(viewport={'width':1440,'height':1100},reduced_motion='no-preference',accept_downloads=True);page=ctx.new_page();errors=[];remote=[]
 page.on('pageerror',lambda e:errors.append(str(e)));page.on('request',lambda r:remote.append(r.url) if r.url.startswith('http') and not r.url.startswith('http://127.0.0.1:5174') else None)
 page.goto('http://127.0.0.1:5174');expect(page.locator('.paper-block')).to_have_count(2);page.locator('.library-switch button').nth(1).click();expect(page.locator('.visual-library-card')).to_have_count(9);check('nine interactive templates available without changing existing workspace')
 # Drag a component into the paper.
 grip=page.get_by_role('button',name='拖动演示：双焦点距离和');a=grip.bounding_box();z=page.locator('.drop-zone').bounding_box();page.mouse.move(a['x']+5,a['y']+5);page.mouse.down();page.mouse.move(a['x']-15,a['y']+5,steps=4);page.mouse.move(z['x']+z['width']/2,z['y']+40,steps=20);page.mouse.up();page.wait_for_timeout(150)
 expect(page.locator('.visual-paper-block')).to_have_count(1);check('actual pointer drag adds a visualization alongside questions')
 block=page.locator('.visual-paper-block').first;block.get_by_role('button',name='展开交互',exact=True).click();frame=block.frame_locator('iframe');expect(frame.locator('#a')).to_have_value('5');params(frame,'#a',6);params(frame,'#ratio',.7)
 expect(block).to_contain_text('a=6.0');check('embedded controls update parent block parameters')
 frame.locator('#play').click();page.wait_for_timeout(850);check('parent synchronization does not pause playback',frame.locator('#play').get_attribute('aria-pressed')=='true');frame.locator('#play').click();page.wait_for_timeout(400)
 data,path=backup(page,'visual-backup.json');vp=data['blocks'][-1]['visualization']['parameters'];check('project backup includes complete visualization configuration',vp['a']==6 and vp['ratio']==.7)
 frame_model=frame.locator('body').evaluate('()=>window.ellipseLab.model');check('embedded live values follow ellipse model',abs(frame_model['r1']+frame_model['r2']-12)<1e-9 and abs(frame_model['normalized']-1)<1e-9)
 block.get_by_role('button',name='收起演示',exact=True).click();page.get_by_text('已保存到本机',exact=True).wait_for();page.reload();block=page.locator('.visual-paper-block').first;expect(block).to_contain_text('a=6.0');block.get_by_role('button',name='展开交互',exact=True).click();frame=block.frame_locator('iframe');expect(frame.locator('#a')).to_have_value('6');expect(frame.locator('#ratio')).to_have_value('0.7');check('reload restores parameters and controls')
 block.get_by_role('button',name='收起演示',exact=True).click();page.get_by_role('button',name='复制第 3 题',exact=True).click();expect(page.locator('.visual-paper-block')).to_have_count(2)
 copied=page.locator('.visual-paper-block').last;copied.get_by_role('button',name='重置参数',exact=True).click();expect(copied).to_contain_text('a=5.0');expect(page.locator('.visual-paper-block').first).to_contain_text('a=6.0');check('copied visualization parameters are independent')
 # Put a visual before the original questions: their displayed numbers remain 01/02.
 page.get_by_role('button',name='上移第 3 题',exact=True).click();page.get_by_role('button',name='上移第 2 题',exact=True).click();nums=page.locator('.paper-block:not(.visual-paper-block) .block-number').all_text_contents();check('mixed ordering does not consume question numbers',nums==['01','02'])
 # Every scene starts with a working diagram and expected mode.
 page.locator('.library-switch button').nth(1).click()
 scenes=[('foci','双焦点距离和'),('directrix','焦点与准线'),('compression','圆的压缩'),('circles','同心圆参数构造'),('trammel','双滑块绘图'),('projection','圆的正投影'),('cone','圆锥截线'),('equidistance','定圆与定点等距'),('string','Anatomy 椭圆拉绳仪')]
 for mode,title in scenes:
  card=page.locator('.visual-library-card').filter(has=page.get_by_role('heading',name=title,exact=True));card.get_by_role('button',name='先看演示',exact=True).click();dialog=page.get_by_role('dialog',name=title,exact=True);f=dialog.frame_locator('iframe')
  if mode=='string':
   expect(f.locator('#c')).to_have_value('3');f.locator('[data-c="5"]').click();expect(f.locator('.iso-stage')).to_have_attribute('data-kind','segment');f.locator('[data-c="5.5"]').click();expect(f.locator('.iso-stage')).to_have_attribute('data-kind','empty');check('Anatomy preserves circle, closed-segment, and empty-set teaching boundaries')
  else:
   expect(f.locator('#mode-title')).to_be_visible()
   check(f'{mode}: correct scene and model',f.locator('body').evaluate('()=>window.ellipseLab.state.mode')==mode)
   if mode=='compression':params(f,'#blend',.36)
   if mode in ['cone','projection']:params(f,'#yaw',57)
   if mode=='equidistance':f.locator('#boundary-toggle').check();expect(f.locator('#status')).to_contain_text('半射线')
  check(f'{mode}: no math rendering errors',f.locator('.katex-error,.katex-render-error').count()==0)
  dialog.get_by_role('button',name='关闭',exact=True).click()
 # Add trammel as a second template and check parameter persistence of extra controls.
 page.get_by_role('button',name='加入演示：圆的压缩',exact=True).click();v=page.locator('.visual-paper-block').last;v.get_by_role('button',name='展开交互',exact=True).click();f=v.frame_locator('iframe');expect(f.locator('#blend')).to_have_value('1');params(f,'#blend',.36);page.wait_for_timeout(400);v.get_by_role('button',name='收起演示',exact=True).click()
 data,path=backup(page,'mixed-visual.json');check('compression blend is included in stored state',data['blocks'][-1]['visualization']['parameters']['blend']==.36)
 # Export a self-contained classroom page, then open it with all network requests blocked.
 page.get_by_role('button',name='导出讲义',exact=True).click()
 with page.expect_download() as d:page.get_by_role('button',name='课堂互动 HTML（含推导）').click()
 exported=WORK/'classroom.html';d.value.save_as(exported);offline=ctx.new_page();offline_errors=[];offline.on('pageerror',lambda e:offline_errors.append(str(e)));offline.route('http://**/*',lambda route:route.abort());offline.route('https://**/*',lambda route:route.abort());offline.goto(exported.as_uri());expect(offline.locator('iframe')).to_have_count(3);of=offline.frame_locator('iframe').first;expect(of.locator('#a')).to_have_value('6');params(of,'#a',6.4);expect(of.locator('#a-out')).to_have_text('6.4');check('downloaded classroom HTML works from file with network blocked',not offline_errors)
 check('offline classroom renders ordinary-question math',offline.locator('.question .katex').count()>0)
 # Student Markdown is static and cannot accidentally carry HTML scripts or teacher proof.
 page.get_by_role('button',name='导出讲义',exact=True).click()
 with page.expect_download() as d:page.get_by_role('button',name='学生版 Markdown').click()
 md=WORK/'mixed-student.md';d.value.save_as(md);text=md.read_text();check('student Markdown has static tasks, correct numbering, no iframe or scripts','## 2.' in text and '## 3.' not in text and '<iframe' not in text and '<script' not in text)
 # Original v1 workspaces still restore; visual configurations restore too.
 page.locator('.library-footer input[type=file]').set_input_files(str(path));expect(page.locator('.visual-paper-block')).to_have_count(3);check('JSON project restore preserves all visual modules')
 page.locator('.paper-scroll').evaluate('(e)=>e.scrollTop=0');page.screenshot(path=str(ROOT/'交互模块界面.png'),full_page=True)
 check('no uncaught errors or off-device requests',not errors and not remote)
 result={'passed':len(checks),'checks':checks,'browserErrors':errors,'remoteRequests':remote};(ROOT/'交互模块验收.json').write_text(json.dumps(result,ensure_ascii=False,indent=2));print(json.dumps(result,ensure_ascii=False,indent=2));b.close()
