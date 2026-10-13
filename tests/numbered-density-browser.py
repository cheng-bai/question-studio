"""Exercise import-rule selection, dense layout, and actual local exam printing.

Set QUESTION_STUDIO_REAL_MD to a teacher Markdown with companion images to repeat
the optional real-material check. It reads the original files without changing them.
"""
from pathlib import Path
import hashlib
import json
import os
import re
import fitz
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT / '.verification-work'
WORK.mkdir(exist_ok=True)
checks = []


def check(label, condition=True):
    assert condition, label
    checks.append(label)


def reparse(dialog, mode):
    dialog.get_by_label('拆分规则', exact=True).select_option(mode)
    expect(dialog.get_by_role('button', name=re.compile('确认加入'))).to_be_disabled()
    dialog.get_by_role('button', name='重新拆题预览', exact=True).click()


def prepared_pdf(context, dialog, path):
    expect(dialog.get_by_role('button', name='打印 / 保存 PDF', exact=True)).to_be_enabled()
    expected_font = float(dialog.get_by_label('正文字号',exact=True).input_value())*96/72
    expected_line = float(dialog.get_by_label('全局行间距',exact=True).input_value())
    dialog.page.wait_for_function('''({font,line})=>{const doc=document.querySelector('.print-preview iframe')?.contentDocument;if(!doc?.body)return false;const style=doc.defaultView.getComputedStyle(doc.body);return Math.abs(parseFloat(style.fontSize)-font)<.01&&Math.abs(parseFloat(style.lineHeight)/parseFloat(style.fontSize)-line)<.01}''',arg={'font':expected_font,'line':expected_line})
    frame = dialog.frame_locator('iframe')
    html = frame.locator('html').evaluate('(e)=>"<!doctype html>"+e.outerHTML')
    doc = context.new_page()
    doc.route('http://**/*', lambda route: route.abort())
    doc.route('https://**/*', lambda route: route.abort())
    doc.set_content(html)
    doc.evaluate('()=>document.fonts.ready')
    doc.evaluate('()=>Promise.all([...document.images].map(i=>i.decode()))')
    doc.pdf(path=str(path), prefer_css_page_size=True, print_background=True)
    doc.close()
    return html


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, channel='chrome')
    context = browser.new_context(viewport={'width':1440,'height':1000}, accept_downloads=True)
    page = context.new_page()
    errors, remote = [], []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('request', lambda r: remote.append(r.url) if r.url.startswith('http') and not r.url.startswith('http://127.0.0.1:5174/') else None)
    page.goto('http://127.0.0.1:5174/')
    expect(page.locator('.bank-card')).to_have_count(10)
    page.evaluate('()=>document.fonts.ready')
    metrics = page.evaluate('''()=>{const bank=document.querySelector('.bank-scroll'),r=bank.getBoundingClientRect();return{bankVisibleHeight:r.height,bankContentHeight:bank.scrollHeight,firstCardHeight:document.querySelector('.bank-card').getBoundingClientRect().height,fullyVisibleCards:[...bank.querySelectorAll('.bank-card')].filter(el=>{const a=el.getBoundingClientRect();return a.top>=r.top&&a.bottom<=r.bottom}).length,paperBlockHeight:document.querySelector('.paper-block').getBoundingClientRect().height}}''')
    check('1440x1000 shows at least four complete source cards without truncating stems', metrics['fullyVisibleCards'] >= 4)
    check('formula rendering stays correct in compact editor', page.locator('.katex').count() == 46 and page.locator('.katex-error').count() == 0)
    page.evaluate('()=>Promise.all(document.getAnimations().map(a=>a.finished))')
    page.screenshot(path=str(ROOT / '紧凑界面预览.png'))
    page.get_by_role('button', name='导入资料', exact=True).click()
    dialog = page.get_by_role('dialog', name='把资料变成题目模块')
    raw = '# 混合编号资料\n## 1. 已知 $f(x)=x^2$，求 $f(2)$。\n答案：$4$\n解析：代入 $x=2$。\n3. 已知等比数列 $a_n=2^n$，求 $a_3$。\n（1）写出前三项；\n（2）求和。\n答案：$8$\n解析：代入通项。\n7．已知集合 $A=\\{1,2\\}$，求元素个数。\n答案：$2$'
    dialog.locator('.import-source textarea').fill(raw)
    dialog.get_by_role('button', name='重新拆题预览', exact=True).click()
    expect(dialog.locator('.import-question')).to_have_count(1)
    expect(dialog).to_contain_text('可能是题号或解析步骤')
    check('auto preview preserves ambiguous plain IDs after analysis and explains them')
    reparse(dialog, 'numbered')
    expect(dialog.locator('.import-question')).to_have_count(3)
    expect(dialog.locator('.split-summary')).to_contain_text('1、3、7')
    expect(dialog.locator('.import-question').nth(1)).to_contain_text('（2）求和')
    check('explicit dotted rule recovers skipped IDs after solutions while preserving subquestions')
    dialog.locator('.import-source').evaluate('(e)=>e.scrollTop=0')
    page.screenshot(path=str(ROOT / '数字题号拆分预览.png'))
    dialog.get_by_role('button', name='关闭', exact=True).click()

    # Native file-input batch, then reparse both original sources with one rule.
    files = []
    for name in ['batch-a.md','batch-b.md']:
        path = WORK / name
        path.write_text('1. 计算 $1+1$。\n答案：$2$\n解析：加法。\n4. 计算 $2+2$。\n答案：$4$')
        files.append(str(path))
    page.get_by_role('button', name='导入资料', exact=True).click()
    dialog = page.get_by_role('dialog', name='把资料变成题目模块')
    dialog.locator('input[type=file][accept=".md"]').set_input_files(files)
    expect(dialog.locator('.import-question')).to_have_count(2)
    reparse(dialog, 'numbered')
    expect(dialog.locator('.import-question')).to_have_count(4)
    expect(dialog.locator('.import-exam')).to_have_count(2)
    check('changing the rule reparses all batch files instead of only the pasted editor')
    dialog.get_by_role('button', name='关闭', exact=True).click()

    # Supplement a structured folder without borrowing A's image for B.
    folder = WORK/'补图资料'
    (folder/'A/images').mkdir(parents=True, exist_ok=True)
    from PIL import Image
    Image.new('RGB',(20,20),'#205747').save(folder/'A/images/q.png')
    page.evaluate("""()=>{const dt=new DataTransfer();for(const name of ['A','B']){const file=new File(['1. 求图中点数。\\n![图](images/q.png)'], 'exam.md', {type:'text/markdown'});Object.defineProperty(file,'webkitRelativePath',{value:'补图资料/'+name+'/exam.md'});dt.items.add(file);}document.body.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:dt}));}""")
    dialog = page.get_by_role('dialog',name='把资料变成题目模块')
    expect(dialog.locator('.import-question')).to_have_count(2)
    dialog.get_by_label('补充配图文件夹',exact=True).set_input_files(str(folder))
    expect(dialog.locator('.import-question img')).to_have_count(1)
    expect(dialog.locator('.missing-assets')).to_contain_text('1 张配图待补充')
    check('supplementing a structured folder never aliases A image into missing B image')
    reparse(dialog,'numbered')
    expect(dialog.locator('.import-question img')).to_have_count(1)
    expect(dialog.locator('.missing-assets')).to_contain_text('1 张配图待补充')
    check('batch reparse retains strict per-exam asset paths and missing-image diagnostics')
    dialog.get_by_role('button',name='关闭',exact=True).click()

    # A full real teacher exam, selecting images explicitly for browser permissions.
    real_path = os.environ.get('QUESTION_STUDIO_REAL_MD')
    real_result = None
    if real_path:
        source = Path(real_path)
        source_text = source.read_text()
        image_paths = [source.parent / url for url in re.findall(r'!\[[^\]]*\]\(([^)]+)\)', source_text)]
        originals = [source] + image_paths
        before_hash = {str(path):hashlib.sha256(path.read_bytes()).hexdigest() for path in originals}
        page.get_by_role('button', name='导入资料', exact=True).click()
        dialog = page.get_by_role('dialog', name='把资料变成题目模块')
        dialog.locator('input[type=file][accept=".md"]').set_input_files(str(source))
        expect(dialog.locator('.import-question')).to_have_count(21)
        if image_paths:
            dialog.get_by_label('补充配图文件', exact=True).set_input_files([str(path) for path in image_paths])
        expect(dialog.locator('.missing-assets')).to_have_count(0)
        reparse(dialog, 'numbered')
        expect(dialog.locator('.import-question')).to_have_count(21)
        expect(dialog.locator('.missing-assets')).to_have_count(0)
        check('real 21-question teacher exam keeps every source number and companion image in both rules')
        dialog.get_by_role('button', name='确认加入 21 道题', exact=True).click()
        expect(page.locator('.bank-card')).to_have_count(21)
        page.get_by_role('button', name='新建讲义', exact=True).click()
        page.get_by_label('讲义标题', exact=True).fill('2026上海高考数学 · 导入排版试用')
        page.get_by_label('讲义副标题', exact=True).fill('原第 1、16、18 题 · 保留原题与配图')
        for number in [1,16,18]:
            page.get_by_role('button', name=f'加入原第 {number} 题', exact=True).click()
        expect(page.locator('.paper-block')).to_have_count(3)
        page.locator('.paper-scroll').evaluate('(e)=>e.scrollTop=e.scrollHeight')
        expect(page.locator('.paper-block img')).to_have_count(2)
        check('real questions and their two stem diagrams are composed as independent handout copies')
        with page.expect_download() as download:
            page.get_by_role('button', name='备份工程', exact=True).click()
        backup_path = WORK / 'real-material-project.json'
        download.value.save_as(backup_path)
        project = json.loads(backup_path.read_text())
        exam = project['exams'][-1]
        check('real imported source raw, lines, and all 21 original answers survive project backup', exam['raw']==source_text and [q['number'] for q in exam['questions']]==[str(i) for i in range(1,22)] and all(q['answer'] and q['source']['line']>0 for q in exam['questions']))
        page.get_by_role('button', name='打印讲义', exact=True).click()
        pd = page.get_by_role('dialog', name='打印讲义')
        pd.get_by_role('button', name='紧凑排版', exact=True).click()
        expect(pd.get_by_role('button', name='打印 / 保存 PDF', exact=True)).to_be_enabled()
        frame = pd.frame_locator('iframe')
        check('compact preset preserves 8mm/30mm student writing space', frame.locator('.writing-space').evaluate_all('(els)=>els.map(e=>e.style.height)')==['8mm','8mm','30mm'])
        student = prepared_pdf(context, pd, ROOT/'真实资料试用-学生版.pdf')
        check('real student print has both stem diagrams, formulas, and no solution fields', frame.locator('img').count()==2 and frame.locator('.katex').count()>0 and frame.locator('.solution,.tags').count()==0 and frame.locator('.katex-error').count()==0)
        pd.get_by_label('打印版本', exact=True).select_option('teacher')
        compact = prepared_pdf(context, pd, ROOT/'真实资料试用-教师版-紧凑.pdf')
        compact_height = pd.frame_locator('iframe').locator('main').evaluate('(e)=>e.getBoundingClientRect().height')
        check('real teacher print contains original answers, rendered tag formulas, and no added writing spaces', pd.frame_locator('iframe').locator('.tags .katex').count()>0 and pd.frame_locator('iframe').locator('.solution').count()>=6 and pd.frame_locator('iframe').locator('img').count()==3 and pd.frame_locator('iframe').locator('.writing-space').count()==0)
        pd.get_by_role('button', name='舒展排版', exact=True).click()
        relaxed = prepared_pdf(context, pd, ROOT/'真实资料试用-教师版-舒展.pdf')
        relaxed_height = pd.frame_locator('iframe').locator('main').evaluate('(e)=>e.getBoundingClientRect().height')
        with fitz.open(ROOT/'真实资料试用-教师版-紧凑.pdf') as compact_doc, fitz.open(ROOT/'真实资料试用-教师版-舒展.pdf') as relaxed_doc:
            check('compact teacher layout reduces content height without increasing PDF pages', compact_height < relaxed_height and len(compact_doc)<=len(relaxed_doc))
        pd.get_by_role('button', name='紧凑排版', exact=True).click()
        expect(pd.get_by_role('button', name='打印 / 保存 PDF', exact=True)).to_be_enabled()
        page.screenshot(path=str(ROOT/'真实资料紧凑打印预览.png'))
        pd.get_by_role('button', name='关闭', exact=True).click()
        page.get_by_text('已保存到本机', exact=True).wait_for()
        page.reload()
        page.get_by_role('button', name='打印讲义', exact=True).click()
        pd = page.get_by_role('dialog', name='打印讲义')
        expect(pd.get_by_role('button', name='紧凑排版', exact=True)).to_have_attribute('aria-pressed','true')
        check('compact print choices survive refresh without changing the selected print version')
        for path in originals:
            assert hashlib.sha256(path.read_bytes()).hexdigest()==before_hash[str(path)]
        check('source Markdown and companion image hashes remain unchanged')
        real_result = {'source':str(source),'sourceQuestions':21,'handoutOriginalNumbers':[1,16,18],'images':len(image_paths),'compactContentHeight':round(compact_height,1),'relaxedContentHeight':round(relaxed_height,1),'heightReductionPercent':round((1-compact_height/relaxed_height)*100,1),'pdfPages':{}}
        for name in ['真实资料试用-学生版.pdf','真实资料试用-教师版-紧凑.pdf','真实资料试用-教师版-舒展.pdf']:
            doc = fitz.open(ROOT/name)
            assert all(abs(p.rect.width-595.28)<1 and abs(p.rect.height-841.89)<1 for p in doc)
            real_result['pdfPages'][name]=len(doc)
            for i in range(len(doc)):
                doc[i].get_pixmap(matrix=fitz.Matrix(1,1)).save(str(WORK/f'{Path(name).stem}-第{i+1}页.png'))
            doc.close()
        pd.get_by_role('button', name='关闭', exact=True).click()

    # Small screens must still expose rule and print controls without clipping.
    page.set_viewport_size({'width':390,'height':844})
    check('compact editor has no horizontal mobile overflow', page.evaluate('document.documentElement.scrollWidth<=innerWidth'))
    page.get_by_role('button', name='导入资料', exact=True).click()
    dialog = page.get_by_role('dialog', name='把资料变成题目模块')
    expect(dialog.get_by_label('拆分规则', exact=True)).to_be_visible()
    check('mobile import rule controls fit within the dialog', page.evaluate('document.documentElement.scrollWidth<=innerWidth'))
    dialog.get_by_role('button', name='关闭', exact=True).click()
    page.get_by_role('button', name='打印讲义', exact=True).click()
    pd = page.get_by_role('dialog', name='打印讲义')
    expect(pd.get_by_role('button', name='紧凑排版', exact=True)).to_be_visible()
    check('compact print controls fit on mobile', page.evaluate('document.documentElement.scrollWidth<=innerWidth'))
    check('no uncaught browser errors during numbered import and compact print', not errors)
    check('no off-device requests during tested workflows', not remote)
    result = {'passed':len(checks),'checks':checks,'densityMetrics':metrics,'realMaterial':real_result,'browserErrors':errors,'remoteRequests':remote}
    (ROOT/'紧凑排版与数字拆题验收.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps(result,ensure_ascii=False,indent=2))
    browser.close()
