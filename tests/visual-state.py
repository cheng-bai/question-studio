from pathlib import Path
import json
from playwright.sync_api import sync_playwright,expect
ROOT=Path(__file__).resolve().parents[1];WORK=ROOT/'.verification-work';checks=[]
def backup(page,name):
 with page.expect_download() as d:page.get_by_role('button',name='备份工程',exact=True).click()
 path=WORK/name;d.value.save_as(path);return json.loads(path.read_text())
with sync_playwright() as p:
 b=p.chromium.launch(headless=True,channel='chrome');ctx=b.new_context(viewport={'width':1440,'height':1100},accept_downloads=True);page=ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto('http://127.0.0.1:5174/');page.locator('.library-switch button').nth(1).click();page.get_by_role('button',name='加入演示：双焦点距离和',exact=True).click()
 block=page.locator('.visual-paper-block').first;block.get_by_role('button',name='展开交互',exact=True).click();f=block.frame_locator('iframe');expect(f.locator('#a')).to_have_value('5')
 expect(block.locator('iframe')).to_have_attribute('aria-busy','false');f.locator('#play').click();expect(f.locator('#play')).to_have_attribute('aria-pressed','true');page.wait_for_timeout(900);page.get_by_role('button',name='复制第 3 题',exact=True).click();expect(page.locator('.visual-paper-block')).to_have_count(2);data=backup(page,'playback-copy.json');a,c=[q['visualization']['parameters'] for q in data['blocks'] if q.get('kind')=='visualization']
 assert a==c and a['degrees']!=35,(a,c)
 checks.append('copy during playback pauses and captures identical current parameters for both independent instances')
 expect(block.locator('iframe')).to_have_attribute('aria-busy','false');f.locator('#play').click();expect(f.locator('#play')).to_have_attribute('aria-pressed','true');page.wait_for_timeout(900);page.get_by_role('button',name='编辑第 3 题',exact=True).click();dialog=page.get_by_role('dialog',name='编辑演示模块');angle=f.locator('body').evaluate('()=>window.__tixuApi.getState().degrees');assert angle!=a['degrees']
 assert f.locator('#play').get_attribute('aria-pressed')=='false'
 dialog.get_by_label('教学备注').fill('独立复核后的文字修改');dialog.get_by_role('button',name='保存修改',exact=True).click();data=backup(page,'playback-edit.json');v=[q for q in data['blocks'] if q.get('kind')=='visualization'];assert v[0]['visualization']['parameters']['degrees']==angle;assert v[1]['visualization']['parameters']['degrees']==c['degrees'];assert v[0]['notes']=='独立复核后的文字修改'
 checks.append('editing during playback preserves current angle and text without altering the copied instance')
 f.locator('#play').click();page.wait_for_timeout(600);downloads=[];page.on('download',lambda d:downloads.append(d));page.get_by_role('button',name='备份工程',exact=True).evaluate('(b)=>{b.click();b.click()}');page.wait_for_timeout(1700);assert len(downloads)==2,len(downloads)
 values=[]
 for i,d in enumerate(downloads):
  path=WORK/f'concurrent-{i}.json';d.save_as(path);values.append(json.loads(path.read_text())['blocks'][2]['visualization']['parameters'])
 assert values[0]==values[1] and values[0]['degrees']!=angle,values
 checks.append('simultaneous backup requests share one current-parameter snapshot')
 page.get_by_role('button',name='加入演示：Anatomy 椭圆拉绳仪',exact=True).click();page.get_by_role('button',name='导出讲义',exact=True).click()
 with page.expect_download() as d:page.get_by_role('button',name='课堂互动 HTML（含推导）').click()
 path=WORK/'string-offline.html';d.value.save_as(path);offline=ctx.new_page();offline_errors=[];offline.on('pageerror',lambda e:offline_errors.append(str(e)));offline.route('http://**/*',lambda r:r.abort());offline.route('https://**/*',lambda r:r.abort());offline.goto(path.as_uri());expect(offline.locator('iframe')).to_have_count(3);of=offline.frame_locator('iframe').last;expect(of.locator('#c')).to_have_value('3');of.locator('[data-c="5.5"]').click();expect(of.locator('.iso-stage')).to_have_attribute('data-kind','empty');assert not offline_errors,offline_errors
 checks.append('offline classroom HTML embeds both ellipse and Anatomy sources and preserves no-solution boundary without network')
 assert not errors,errors;checks.append('state-operation regression has no uncaught browser errors')
 (ROOT/'交互状态验收.json').write_text(json.dumps({'passed':len(checks),'checks':checks},ensure_ascii=False,indent=2)+'\n');print(json.dumps(checks,ensure_ascii=False));b.close()
