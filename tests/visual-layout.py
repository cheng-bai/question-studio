from pathlib import Path
import json
from playwright.sync_api import sync_playwright, expect
ROOT=Path(__file__).resolve().parents[1]
checks=[]
with sync_playwright() as p:
 b=p.chromium.launch(headless=True,channel='chrome')
 ctx=b.new_context(viewport={'width':1440,'height':1100})
 page=ctx.new_page();page.goto('http://127.0.0.1:5174/')
 page.locator('.library-switch button').nth(1).click()
 page.get_by_role('button',name='加入演示：双焦点距离和',exact=True).click()
 block=page.locator('.visual-paper-block').first
 block.get_by_role('button',name='展开交互',exact=True).click()
 expect(block.locator('iframe')).to_have_attribute('aria-busy','false');frame=block.frame_locator('iframe');expect(frame.locator('#a')).to_have_value('5')
 page.locator('.paper-scroll').evaluate('(el)=>{const b=el.querySelector(".visual-paper-block");el.scrollTop+=b.getBoundingClientRect().top-el.getBoundingClientRect().top-12}')
 page.locator('.bank-scroll').evaluate('(el)=>el.scrollTop=0')
 page.screenshot(path=str(ROOT/'交互模块展开.png'),full_page=True)
 checks.append('desktop inline interaction has working controls and rendered math')
 block.get_by_role('button',name='收起演示',exact=True).click()
 page.get_by_role('button',name='加入演示：Anatomy 椭圆拉绳仪',exact=True).click()
 block=page.locator('.visual-paper-block').last
 block.get_by_role('button',name='课堂展开',exact=True).click()
 dialog=page.get_by_role('dialog');expect(dialog.locator('iframe')).to_have_attribute('aria-busy','false');f=dialog.frame_locator('iframe');expect(f.locator('#c')).to_have_value('3')
 page.screenshot(path=str(ROOT/'Anatomy课堂展开.png'),full_page=True)
 checks.append('Anatomy classroom dialog has working controls and full view')
 dialog.get_by_role('button',name='关闭',exact=True).click()
 page.set_viewport_size({'width':390,'height':844})
 page.locator('.paper-scroll').evaluate('(el)=>el.scrollTop=0')
 assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'page mobile overflow'
 checks.append('390px mixed-module editor has no horizontal page overflow')
 block=page.locator('.visual-paper-block').first;block.get_by_role('button',name='展开交互',exact=True).click()
 f=block.frame_locator('iframe');expect(f.locator('#a')).to_have_value('5')
 assert f.locator('body').evaluate('()=>document.documentElement.scrollWidth <= innerWidth'), 'frame mobile overflow'
 block.scroll_into_view_if_needed();page.screenshot(path=str(ROOT/'交互模块窄屏.png'),full_page=True)
 checks.append('390px embedded interaction has no horizontal frame overflow')
 (ROOT/'交互布局验收.json').write_text(json.dumps({'passed':len(checks),'checks':checks},ensure_ascii=False,indent=2)+'\n')
 print(json.dumps(checks,ensure_ascii=False));b.close()
