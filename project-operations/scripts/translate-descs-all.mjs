// Translate all remaining Chinese descriptions to "English + original Chinese".
// Preserves every data-id/class/image-component exactly; adds English above each Chinese block.
import pw from '/Users/kimi/Library/Mobile Documents/com~apple~CloudDocs/DevOps/ROIs-Crew-Ver4-PBS/e2e/node_modules/playwright/index.js'
import { fileURLToPath } from 'node:url'
import { mkdirSync } from 'node:fs'
const { chromium } = pw

const BASE = 'https://crew-f8-usva-tst.roiscloud.com'
const SLUG = 'flair'
const PROJECT = 'badd48f1-a48b-4457-95e0-e2cbf2941cb2'
const AUTH = fileURLToPath(new URL('../.auth/state.json', import.meta.url))
const OUT = fileURLToPath(new URL('../out/', import.meta.url))
mkdirSync(OUT, { recursive: true })

// Each entry: { seq, id, html }
// id values copied from zh-descs.json scan.
const ITEMS = [

// ─── PBS-47 ───────────────────────────────────────────────────────────────────
{
  seq: 47,
  id: '8c47af11-f3a4-415a-be56-00c18765bbce',
  html: [
    '<p class="editor-paragraph-block" data-id="771219fb-74f1-4efd-9967-91935006bde3">',
      'Need to support reading both the old output.gz structure and the new input.gz structure',
      '<br>',
      '需要支持读取老的output.gz 结构和新的 input.gz 结构',
    '</p>',
    '<p class="editor-paragraph-block" data-id="b5485754-feb2-44c1-a98c-0065cf7aa220"></p>',
  ].join(''),
},

// ─── PBS-53 ───────────────────────────────────────────────────────────────────
{
  seq: 53,
  id: 'b3cf8d5f-0a7a-41fe-9bb0-ae6d2b7cd4d5',
  html: [
    '<p class="editor-paragraph-block" data-id="e50bd3b6-da89-4718-9301-44a9e77f8f15">',
      '<span>Block time isn\'t a big thing to be listed for me – it\'s credit time for the pairing that I would like to see on the pairing gantt.</span>',
    '</p>',
    '<image-component data-id="877964db-5b82-4d4d-ad3d-2ad064529ff2" src="e56d0961-18c6-4499-b8bd-3f19cd0270e1" id="877964db-5b82-4d4d-ad3d-2ad064529ff2" width="299px" height="109px" aspectratio="2.7448559670781894" alignment="left" status="uploaded"></image-component>',
    '<p class="editor-paragraph-block" data-id="18ebd625-1042-485f-9bf5-283e562ffc82"></p>',
    '<p class="editor-paragraph-block" data-id="ce07a40d-d1ab-4446-9228-0a8babaed493">',
      '5/12 update: also need DO',
      '<br>',
      '5/12补充：还需要DO',
    '</p>',
  ].join(''),
},

// ─── PBS-69 ───────────────────────────────────────────────────────────────────
{
  seq: 69,
  id: 'a6f3cd5a-cc4f-4d89-a10e-04e3c35e93e5',
  html: [
    '<p class="editor-paragraph-block" data-id="a049c52b-695a-489e-9f46-cc4fb4899f77">',
      'Rework the coverage table, adding fill and open fields: fill = number already assigned, open = number remaining, where open = plan − fill',
      '<br>',
      '改造配比表，增加 fill, open字段，用来记录已分配几个，open还剩几个，open = plan-fill',
    '</p>',
    '<p class="editor-paragraph-block" data-id="014b50fd-3552-47d7-9f3f-bdfd0d08b2fd"></p>',
  ].join(''),
},

// ─── PBS-72 ───────────────────────────────────────────────────────────────────
{
  seq: 72,
  id: '1b99e48a-1f3e-4f52-8cef-bf59e8d5c5f9',
  html: [
    '<p class="editor-paragraph-block" data-id="034fc23b-281f-42bc-b905-127adeb9ad1c">High priority<br>高优先级</p>',
    '<ol class="list-decimal pl-7 space-y-(--list-spacing-y) tight" data-id="c5e48a00-9827-48cc-bbc2-6e2681167ca4" data-tight="true">',
      '<li class="not-prose space-y-2" data-id="84abd2f5-a9b1-47ec-843e-0e53b05f1dcf">',
        '<p class="editor-paragraph-block" data-id="67685a22-a72e-4050-a869-89605dacaa75">',
          'Add credit statistics to the system so customers can view the monthly stats for June (within Scenario)',
          '<br>',
          '添加credit 统计到系统内, 可以让客户看到6月的月度统计(场景内)',
        '</p>',
      '</li>',
      '<li class="not-prose space-y-2" data-id="ae1f2b33-8817-481e-949e-50358aee1d35">',
        '<p class="editor-paragraph-block" data-id="184db581-41fa-4520-a033-d0091f32c11f">',
          'Add pairing coverage ratio',
          '<br>',
          '添加任务环配比',
        '</p>',
      '</li>',
      '<li class="not-prose space-y-2" data-id="157a5247-3cdc-4506-b497-939c1f0f3857">',
        '<p class="editor-paragraph-block" data-id="4dcf70bf-0f09-4c36-929d-dd5549fd39f4">',
          'Add pairing filter conditions (keep Scenario consistent with Live; both need coverage query and the "open" option)',
          '<br>',
          '添加任务环过滤条件(scenario 内和live保持一致, 都需要添加覆盖率查询都需要添加open的选项)',
        '</p>',
      '</li>',
      '<li class="not-prose space-y-2" data-id="018a970e-b02d-4ebe-a4f7-4c35fe3c773e">',
        '<p class="editor-paragraph-block" data-id="2b23a8b8-c626-44bc-9348-8ff3ea14ae11">',
          'Enrich the various features within Scenario',
          '<br>',
          '丰富场景内的各种功能',
        '</p>',
      '</li>',
    '</ol>',
    '<p class="editor-paragraph-block" data-id="98199384-10eb-4e2e-b9ec-bb54b6926720"></p>',
    '<p class="editor-paragraph-block" data-id="04fee89d-94bd-4011-8e18-8a9613c66233">Then complete:<br>然后完成: </p>',
    '<p class="editor-paragraph-block" data-id="52a4c663-f66a-42aa-9ab9-daaf94e47600">',
      'All feature enhancements listed in the customer feedback document',
      '<br>',
      '客户反馈文档内的各类功能加强',
    '</p>',
    '<p class="editor-paragraph-block" data-id="32e16e01-878c-4db2-b7c3-1144a9d19326"></p>',
  ].join(''),
},

// ─── PBS-74 ───────────────────────────────────────────────────────────────────
{
  seq: 74,
  id: '5db25f7b-20da-4f6f-a7f5-c1d9e54e7a96',
  html: [
    '<p class="editor-paragraph-block" data-id="3d1967d0-1ebe-4280-a2cc-bfd7f1a02f2c">',
      'S3 pairings are the initial pairings, used for resource-analysis tasks<br>User story:',
      '<br>',
      'S3 任务环为初始的任务环, 用于资源分析任务<br>用户故事:',
    '</p>',
    '<p class="editor-paragraph-block" data-id="8a1f7dcb-96ed-4317-9e30-26e5dcee6669">',
      'Timing: before the official import of NOC pairings each month',
      '<br>',
      '发生时间: 每个月正式导入NOC 任务环之前',
    '</p>',
    '<p class="editor-paragraph-block" data-id="d346d76b-b62e-4f65-ad97-f3cc204a1d90">',
      '<br>1. User uploads a file and imports it as pairings',
      '<br>',
      '<br>1. 用户上传文件, 导入为任务环',
    '</p>',
    '<ol class="list-decimal pl-7 space-y-(--list-spacing-y) tight" data-id="2bb5c965-16b4-4867-931a-c31470a08c79" data-tight="true" start="2">',
      '<li class="not-prose space-y-2" data-id="938d3fd9-35ef-45c3-a350-3a635e6f3a03">',
        '<p class="editor-paragraph-block" data-id="64d78f4b-49fd-4fdc-8a04-87955e78ef6a">',
          'Each set of pairings has its own scenario id',
          '<br>',
          '每一份任务环有独立的scneario id',
        '</p>',
      '</li>',
      '<li class="not-prose space-y-2" data-id="aa79f37a-17ee-44d7-945e-5dde3cc736f6">',
        '<p class="editor-paragraph-block" data-id="3fe38b69-2ebd-4877-86d7-0c57a1f48018">',
          'User creates a scenario using the uploaded pairings,',
          '<br>',
          '使用上传的任务环来用户创建场景, ',
        '</p>',
      '</li>',
      '<li class="not-prose space-y-2" data-id="e0415abb-429e-4dac-8f24-6bc70802f9e5">',
        '<p class="editor-paragraph-block" data-id="213ed22c-73db-4b5f-bf40-45c62e3eb012">',
          'Run the PBS solver with these pairings to produce the resource-to-pairing match',
          '<br>',
          '用这份任务环来运行PBS slover, 最终得出资源和任务环的匹配关系',
        '</p>',
      '</li>',
    '</ol>',
    '<p class="editor-paragraph-block" data-id="c10d09df-db9e-41f2-bbb8-2414b38fd1b5"></p>',
    '<p class="editor-paragraph-block" data-id="f82912a5-98d8-441a-8712-909ae8496a16">',
      'This task primarily covers steps 1–3 above.',
      '<br>',
      '此任务主要覆盖上述1-3部分.',
    '</p>',
    '<p class="editor-paragraph-block" data-id="419d2320-a7be-4145-bcd5-e2d5347a0090"></p>',
    '<p class="editor-paragraph-block" data-id="5a860957-54cf-4dda-8ab2-305229a81f62"></p>',
  ].join(''),
},

// ─── PBS-75 ───────────────────────────────────────────────────────────────────
{
  seq: 75,
  id: 'e4c88a35-a5a9-4b0c-9ab1-88cf5a22f97e',
  html: [
    '<p class="editor-paragraph-block" data-id="70ddbe49-4e8f-4d44-8855-20d2c8149d55">',
      'Migrate all rules required by Flair to the new system<br><br>Current progress:',
      '<br>',
      '迁移所以flair 需要的法规到新的部分<br><br>目前进展: ',
    '</p>',
    '<ul class="list-disc pl-7 space-y-(--list-spacing-y) tight" data-id="9a5c9a70-cdee-4c34-8e3c-9e5edde978d1" data-tight="true">',
      '<li class="not-prose space-y-2" data-id="86dd2531-b009-4182-a29d-65b5550fe9a8">',
        '<p class="editor-paragraph-block" data-id="5a68e7a4-2c90-4fc0-b11f-06dfc83fd4e2">',
          'Yuanzi has created the framework and developed 2–3 rules',
          '<br>',
          '园子 已经创建了框架, 开发了2-3条法规',
        '</p>',
      '</li>',
    '</ul>',
    '<p class="editor-paragraph-block" data-id="f7c74796-721f-44e7-a40a-33ed7cd357ce"></p>',
    '<p class="editor-paragraph-block" data-id="ed7dcc96-8399-43de-afb1-6c8219790744">Next tasks:<br>后续的任务:</p>',
    '<ul class="list-disc pl-7 space-y-(--list-spacing-y) tight" data-id="9fa96191-09fb-416f-ac3b-98d774077d04" data-tight="true">',
      '<li class="not-prose space-y-2" data-id="09d11341-bf54-4899-8ca2-4aa614fea599">',
        '<p class="editor-paragraph-block" data-id="7ed73ef8-1916-4904-8a06-eb677791af62">',
          'Integrate rule and optimizer performance testing — target: June 12',
          '<br>',
          '需要进行法规与优化性能测试对接 - 期待6/12日完成',
        '</p>',
      '</li>',
      '<li class="not-prose space-y-2" data-id="e4d6ed49-4b19-49ff-bb8d-7a03abcc1b80">',
        '<p class="editor-paragraph-block" data-id="a4c433b9-df32-47ec-af08-605617d59503">',
          'Simultaneously develop all remaining rules — target: June 19',
          '<br>',
          '同时开发所有剩余的法规 - 期待在6/19日完成',
        '</p>',
      '</li>',
    '</ul>',
  ].join(''),
},

// ─── PBS-76 ───────────────────────────────────────────────────────────────────
{
  seq: 76,
  id: 'db4f3f52-5c2e-4c3e-a7df-b1e2e7cfcac7',
  html: [
    '<p class="editor-paragraph-block" data-id="682aba0c-ac45-4821-95ed-163fca66904a">',
      '<span>DO page: clicking the calendar to assign a specific DO should not default-select a whole week (7 days)</span>',
      '<br>',
      '<span>DO </span>页<span>, </span>日历上点击分配具体的<span>DO, </span>不需要默认选择一周<span>7</span>天',
    '</p>',
    '<p class="editor-paragraph-block" data-id="98cee56d-3a8f-4c4e-a12a-ecaff093e30e">',
      'Pairing page, needs to add:',
      '<br>',
      'pairing 页面, 需要添加:',
    '</p>',
    '<p class="editor-paragraph-block" data-id="01567ef1-b2f7-4337-9a59-93b8edbcb1fa"></p>',
    '<p class="editor-paragraph-block" data-id="38cd6f6c-61c2-408b-9ec7-83cd83e19ef1">',
      '<span>&nbsp;</span>- Pairing detail page: add duty-level KPI',
      '<br>',
      '<span>&nbsp;</span>- 任务环详情页面, 需要添加duty leve的KPI',
    '</p>',
    '<p class="editor-paragraph-block" data-id="2e68c1ec-c63a-4838-a900-0b10a2cd38e3"></p>',
    '<p class="editor-paragraph-block" data-id="92a2fc8a-fd6a-4dc3-b1c4-93814761fd65">',
      '<span>&nbsp;- </span>Need a mechanism to show how many pairings each bid property yields',
      '<span>, </span>e.g. first condition filters to<span> 100</span>, second condition filters to<span> 50</span><span>.</span>',
      '<br>',
      '<span>&nbsp;- </span>需要一个机制<span>, </span>每添加一个<span>bid properties, </span>得到了多少任务环<span>, </span>例如第一个<span>, </span>过滤出来<span>100</span>个<span>,</span>第二个条件<span>, </span>过滤出来<span>50</span>个<span>.</span>',
    '</p>',
    '<p class="editor-paragraph-block" data-id="a6b177c8-64b2-43e5-94b7-af7edc778fc4"></p>',
    '<h3 class="editor-heading-block" data-id="01955613-70bd-4f92-a038-a7da449e45c6">5-On / 2-Off Working Pattern</h3>',
    '<p class="editor-paragraph-block" data-id="4eec3b9e-96e0-470d-9d58-de889667faa5"></p>',
  ].join(''),
},

// ─── PBS-84 ───────────────────────────────────────────────────────────────────
{
  seq: 84,
  id: '4d8eefc9-f8c4-4f0b-9e72-a748fe0f0ef0',
  html: [
    '<p class="editor-paragraph-block" data-id="9b419334-6766-4e37-be01-59a3643b4923">',
      '<span>Most flying out of least of working days — move this to the line conditions</span>',
      '<br>',
      '<span>Most flying out of least of working days 改到line 条件</span>',
    '</p>',
  ].join(''),
},

// ─── PBS-86 ───────────────────────────────────────────────────────────────────
{
  seq: 86,
  id: '92d64e35-a70b-4ced-ba7c-e8d8a58c9dde',
  html: [
    '<p class="editor-paragraph-block" data-id="de9d03b2-cceb-4826-9b69-005b8d262793">(1) Unable to view Pairing ID in Roster<br>（1）无法查看Roster的Pairing id</p>',
    '<p class="editor-paragraph-block" data-id="f1f7a2b8-766f-4bff-83d0-2ff60d708712">Double-click has no response<br>双击没反应</p>',
    '<image-component data-id="c7c4573d-8289-4687-9a75-9b4e37858847" src="f37b652d-a88c-41a7-8b6f-d39fdf6cdb6b" id="c7c4573d-8289-4687-9a75-9b4e37858847" width="299px" height="150px" aspectratio="1.9874776386404294" alignment="left" status="uploaded"></image-component>',
    '<p class="editor-paragraph-block" data-id="20290066-fef5-46fc-90b2-60fb561d7e1c">For comparison, double-clicking in Live works<br>作为比较，在Live内双击可以看</p>',
    '<image-component data-id="dc9c8a92-09aa-4a86-b80d-ad3d80e95f9b" src="e373cfd9-f424-445d-abcc-6018823ac0c3" id="dc9c8a92-09aa-4a86-b80d-ad3d80e95f9b" width="299px" height="127px" aspectratio="2.3612334801762116" alignment="left" status="uploaded"></image-component>',
    '<p class="editor-paragraph-block" data-id="0f40118e-8cb1-4cbf-bc7b-b48eb552e369"></p>',
    '<p class="editor-paragraph-block" data-id="9d003ea7-a3a6-4fd5-83e0-2e015d245dab">(2) No right-click menu in Roster<br>（2）Roster右键没有菜单</p>',
    '<p class="editor-paragraph-block" data-id="190a5149-c95b-4655-a0fa-d52388bfbb15">For comparison, Live\'s right-click menu is shown below<br>作为比较，Live的右键菜单如下图</p>',
    '<image-component data-id="1776e44c-0fe1-4389-89c1-d329a67a48f3" src="889c537c-cd1c-4342-84f4-1398f0670392" id="1776e44c-0fe1-4389-89c1-d329a67a48f3" width="305px" height="140px" aspectratio="2.1767810026385224" alignment="left" status="uploaded"></image-component>',
    '<p class="editor-paragraph-block" data-id="26bf799c-cb64-4f2e-9085-1d8d26d272a0"></p>',
  ].join(''),
},

// ─── PBS-89 ───────────────────────────────────────────────────────────────────
{
  seq: 89,
  id: '2b28c1e2-5b5e-4e82-b15d-4a8b8e9fa1f8',
  html: [
    '<p class="editor-paragraph-block" data-id="ecd522ac-8fa0-4015-ae67-21241a919a3c">',
      'Opening June in Live — Pairing Filter not taking effect?',
      '<br>',
      'Live打开6月，Pairing Filter没起作用？',
    '</p>',
    '<p class="editor-paragraph-block" data-id="badee015-d636-456c-b7fe-d76d307d3b80">',
      '(Scroll down a bit)',
      '<br>',
      '拉到下面一点',
    '</p>',
    '<image-component data-id="aa41c140-8055-4b08-b8b0-a2c0803875bb" src="b2a9d709-915f-4f19-b9f6-e4cdd9c83beb" id="aa41c140-8055-4b08-b8b0-a2c0803875bb" width="299px" height="152px" aspectratio="1.962051282051282" alignment="left" status="uploaded"></image-component>',
    '<p class="editor-paragraph-block" data-id="ef4ad9f4-0d12-4da2-bf68-3b371925f981"></p>',
  ].join(''),
},

// ─── PBS-91 ───────────────────────────────────────────────────────────────────
{
  seq: 91,
  id: 'c7fa0d96-7f35-42db-a8ca-5e45df8af1e6',
  html: [
    '<p class="editor-paragraph-block" data-id="e14201a4-d73e-4f51-b389-639089a1e5f3">Using the following case<br>就用以下case</p>',
    '<image-component data-id="e7e970ba-b9ca-42af-bac6-ffb880142c34" src="003c5527-0e0a-49ee-85b7-0bfe57354271" id="e7e970ba-b9ca-42af-bac6-ffb880142c34" width="299px" height="185px" aspectratio="1.6129363449691991" alignment="left" status="uploaded"></image-component>',
    '<p class="editor-paragraph-block" data-id="dcbfdb42-ed73-401d-b4f1-06c2a2e0bcaf">Error says: not found<br>提示找不到</p>',
    '<image-component data-id="7d50e437-7299-49b0-81a4-b8140f3eb338" src="bbf7195e-0d4c-43c4-86d8-de2e31580e03" id="7d50e437-7299-49b0-81a4-b8140f3eb338" width="299px" height="143px" aspectratio="2.095982142857143" alignment="left" status="uploaded"></image-component>',
    '<p class="editor-paragraph-block" data-id="b2aa73e8-865b-4c83-8e90-502fe0ac09ee">But it actually exists<br>实际是有的</p>',
    '<image-component data-id="e0498c75-6e37-4e74-a8a4-896f5f8f394c" src="aa281e87-af2c-4a38-be3b-046c906ed97a" id="e0498c75-6e37-4e74-a8a4-896f5f8f394c" width="299px" height="149px" aspectratio="2.0014245014245016" alignment="left" status="uploaded"></image-component>',
    '<p class="editor-paragraph-block" data-id="3327566e-51d3-4afa-ad2d-a48de5c4b3af"></p>',
  ].join(''),
},

// ─── PBS-94 ───────────────────────────────────────────────────────────────────
{
  seq: 94,
  id: 'a6c1e0bc-9f08-4745-8dc2-35c9fe8c3d64',
  html: [
    '<p class="editor-paragraph-block" data-id="76fc5742-7cb7-4532-823c-5dc001321232">1. Does the Rule Set need to display an ID?<br>1.Rule Set需要显示ID吗？</p>',
    '<image-component data-id="2733ce56-6d65-4315-a1e9-0e28a59e095a" src="d179b793-a44c-4b5c-96ab-dfde98ca69ef" id="2733ce56-6d65-4315-a1e9-0e28a59e095a" width="299px" height="70px" aspectratio="4.294985250737463" alignment="left" status="uploaded"></image-component>',
    '<p class="editor-paragraph-block" data-id="1b5e4cbb-c80b-4323-ab15-a893cac286ee">2. Rules need to display an ID<br>2.Rule需要显示ID</p>',
    '<image-component data-id="446b4405-831a-41ee-9724-e32dfa73ddd2" src="3a2e1fd7-e6de-43bc-9c8e-0eca33fc8b36" id="446b4405-831a-41ee-9724-e32dfa73ddd2" width="299px" height="70px" aspectratio="4.294985250737463" alignment="left" status="uploaded"></image-component>',
    '<p class="editor-paragraph-block" data-id="2130d846-e238-4e68-ac6e-aba290ea662c">',
      '3. The info block above the Rule Set can be optimized — no need to take up 5 whole lines',
      '<br>',
      '3.Rule Set上方的信息，显示方式可以再优化，不用占用5行那么多',
    '</p>',
    '<image-component data-id="b7fb5384-508b-4f15-9356-88234e19f92f" src="0044b5c5-2cdb-40a4-a0d7-c235a4eb5f95" id="b7fb5384-508b-4f15-9356-88234e19f92f" width="299px" height="29px" aspectratio="10.28368794326241" alignment="left" status="uploaded"></image-component>',
    '<p class="editor-paragraph-block" data-id="72adddf7-d63b-43e8-90b5-41f210a5f5e5">',
      '4. After entering Edit, title naming needs a unified convention (can we write a title-naming guideline for the AI?)',
      '<br>',
      '4.进入Edit后，标题命名需要统一规范（可以做一条标题规范给AI吗？）',
    '</p>',
    '<image-component data-id="e4b978d1-ebf2-438d-8466-421ed5f70b15" src="af799497-8d54-4749-86b2-4251dd384595" id="e4b978d1-ebf2-438d-8466-421ed5f70b15" width="299px" height="110px" aspectratio="2.7132075471698114" alignment="left" status="uploaded"></image-component>',
    '<p class="editor-paragraph-block" data-id="76f0876d-0d72-4c6a-82ed-92b884e5d739"></p>',
  ].join(''),
},

// ─── PBS-95 ───────────────────────────────────────────────────────────────────
{
  seq: 95,
  id: 'e3c6b0f4-1a2d-4d63-b67e-9ef0a8d5e2b7',
  html: [
    '<p class="editor-paragraph-block" data-id="1a8b1054-6f52-4467-82c8-284562d26937"></p>',
    '<image-component data-id="6a29fad9-835a-455d-8097-52d881137709" src="b1ed60c4-125e-4e69-8248-f95919670034" id="6a29fad9-835a-455d-8097-52d881137709" width="299px" height="37px" aspectratio="8.165714285714285" alignment="left" status="uploaded"></image-component>',
    '<p class="editor-paragraph-block" data-id="1f844442-5ded-4ad6-8ac2-821373eee38d">',
      'Checking Live\'s Filter conditions — rank and fleet are as follows',
      '<br>',
      '查看Live的Filter条件，rank和fleet如下',
    '</p>',
    '<image-component data-id="dc7ff25a-dd2d-4ec8-b097-053f29cdb378" src="bb5ba184-2a1c-4cee-8d92-de185cbb8ac0" id="dc7ff25a-dd2d-4ec8-b097-053f29cdb378" width="299px" height="234px" aspectratio="1.2790697674418605" alignment="left" status="uploaded"></image-component>',
    '<image-component data-id="792ae0df-2646-4afe-bd58-8466bedef3f8" src="2fc2809a-3813-495c-9745-0c3cb95289ce" id="792ae0df-2646-4afe-bd58-8466bedef3f8" width="299px" height="202px" aspectratio="1.4816753926701571" alignment="left" status="uploaded"></image-component>',
    '<p class="editor-paragraph-block" data-id="a09313d1-b5cb-4d23-9499-2cc2f0c04946">Why is division split into LH and SH?<br>division为什么分LH和SH</p>',
    '<image-component data-id="a1600c89-c95f-4401-b8c3-5a7b906f4222" src="7dd4773a-e1a8-40a5-b143-b8a868ea4b34" id="a1600c89-c95f-4401-b8c3-5a7b906f4222" width="299px" height="103px" aspectratio="2.8974358974358974" alignment="left" status="uploaded"></image-component>',
    '<p class="editor-paragraph-block" data-id="d76e1c18-d5cf-4246-9370-91712d9f10ac"></p>',
  ].join(''),
},

// ─── PBS-96 ───────────────────────────────────────────────────────────────────
{
  seq: 96,
  id: '8d7ea254-4c4e-49e5-98fe-3ef6b2a07c83',
  html: [
    '<p class="editor-paragraph-block" data-id="dadcdc93-522f-41b5-af96-3224153ffab7">Currently, Pairing is special<br>目前，Pairing特殊</p>',
    '<p class="editor-paragraph-block" data-id="8f20ff7d-87fd-48fa-bef7-60ac79eaaa22">Roster</p>',
    '<image-component data-id="5bae0bda-6e5e-4c8d-8efa-66dd2f54070e" src="98e04f52-b039-434f-a839-1a6e1c39d9cb" id="5bae0bda-6e5e-4c8d-8efa-66dd2f54070e" width="299px" height="85px" aspectratio="3.511627906976744" alignment="left" status="uploaded"></image-component>',
    '<p class="editor-paragraph-block" data-id="9b62fd12-bfc6-4d3c-b175-1ce2d92a66b7">Pairing (why is it special?)<br>Pairing（为什么特殊）</p>',
    '<image-component data-id="9bcd9cfb-77ad-4f19-8722-d86fb8701b3c" src="fa31ba4b-dc46-40cf-9c37-0d0ec1471e2c" id="9bcd9cfb-77ad-4f19-8722-d86fb8701b3c" width="299px" height="92px" aspectratio="3.231707317073171" alignment="left" status="uploaded"></image-component>',
    '<p class="editor-paragraph-block" data-id="db6f12e1-7329-4820-9c1e-e4e43c2cff6e">Flight</p>',
    '<image-component data-id="fd7f148a-11cc-4400-8cba-25f36d7adfdb" src="e89f828e-cb21-4e44-86bc-fbe8b1c296e4" id="fd7f148a-11cc-4400-8cba-25f36d7adfdb" width="299px" height="90px" aspectratio="3.325" alignment="left" status="uploaded"></image-component>',
    '<p class="editor-paragraph-block" data-id="36362918-bdd3-4145-98bd-5cfb38569bb0"></p>',
  ].join(''),
},

// ─── PBS-97 ───────────────────────────────────────────────────────────────────
{
  seq: 97,
  id: 'c2e15a3f-8b1d-4c7e-9f0a-7d6e5b4c3a2f',
  html: [
    '<image-component data-id="cbf1bc77-275e-4f57-91b9-f2f89c7f434d" src="c9f65e53-f963-4ba3-9b9f-5af27b70f614" id="cbf1bc77-275e-4f57-91b9-f2f89c7f434d" width="247px" height="27px" aspectratio="9.333333333333334" alignment="left" status="uploaded"></image-component>',
    '<image-component data-id="eb319f09-aae8-4d74-957a-28cbed97c882" src="de86274e-f7a9-46f6-a581-a4fc55ed4c6b" id="eb319f09-aae8-4d74-957a-28cbed97c882" width="247px" height="25px" aspectratio="9.859154929577464" alignment="left" status="uploaded"></image-component>',
    '<p class="editor-paragraph-block" data-id="f479b773-aa43-444b-a12a-2daf561755cc">',
      'For more screenshots and comparisons, please see attachments',
      '<br>',
      '更多的截图和对比，请看附件',
    '</p>',
    '<p class="editor-paragraph-block" data-id="0fc369d6-f570-431e-aa5b-6c5545948a34"></p>',
    '<p class="editor-paragraph-block" data-id="f533e5e4-ac9f-46da-bf84-16f36991ccee"></p>',
    '<p class="editor-paragraph-block" data-id="774e68f2-fea3-4a8e-8226-2799691887b1"></p>',
    '<p class="editor-paragraph-block" data-id="24f95712-4a74-4b04-a100-15384fd0bd33"></p>',
    '<p class="editor-paragraph-block" data-id="45b1684f-f69c-4afa-af9a-1080a4cb3338"></p>',
  ].join(''),
},

// ─── PBS-102 ──────────────────────────────────────────────────────────────────
{
  seq: 102,
  id: '99d63c4e-6b7a-4f28-88c5-1e5f4a3b7d2e',
  html: [
    '<p class="editor-paragraph-block" data-id="2ac31175-cba5-4487-a4cc-3772b8490bdf">',
      'Jen hopes the Beijing team can meet with the OR team next Wednesday evening — there are initial results now, with more to discuss:',
      '<br>',
      'Jen 希望北京下周三晚上需要和OR 团队交流一下 , 目前有初始结果了, 可以交流的更多了:',
    '</p>',
    '<ol class="list-decimal pl-7 space-y-(--list-spacing-y)" data-id="2d44724f-8053-461e-b6bb-9252e6ac3846">',
      '<li class="not-prose space-y-2" data-id="8ed2f717-0114-4c48-b394-f35b0d6516a5">',
        '<p class="editor-paragraph-block" data-id="3f492860-049f-44e5-84fe-754effc3cfe6">',
          'Overall flying hours are too low (need to first analyze the available number of pairings)',
          '<br>',
          '整体飞时偏低 (我们得先分析一下可用的任务环数量)',
        '</p>',
      '</li>',
      '<li class="not-prose space-y-2" data-id="689d70a5-3227-4e85-8f36-14275efea68d">',
        '<p class="editor-paragraph-block" data-id="db098c13-8c5f-4bc3-ac6a-918cac5cf4f1">',
          'No single-day RES desired (minimum 2 consecutive days)',
          '<br>',
          '不希望要有单天的RES (最少连续2天)',
        '</p>',
      '</li>',
      '<li class="not-prose space-y-2" data-id="23da7420-b216-4a0c-9d10-6c7356f98698">',
        '<p class="editor-paragraph-block" data-id="b9ba64c0-881d-4efa-9751-57b0bc36d3b3">',
          'If crew don\'t like any pairing, what would OR do? Who does it get assigned to?',
          '<br>',
          '如果任务环crew 都不喜欢, 哪OR会如何做? 分配给谁',
        '</p>',
      '</li>',
      '<li class="not-prose space-y-2" data-id="7fa18094-ffb5-4daf-8b0b-ee0091322377">',
        '<p class="editor-paragraph-block" data-id="61668eef-cb4a-4642-b5b3-66be3e5f4d61">',
          'How does the optimizer handle soft rules?',
          '<br>',
          '优化如何处理软性法规',
        '</p>',
      '</li>',
    '</ol>',
    '<p class="editor-paragraph-block" data-id="0203cba6-08cf-4c07-9c47-40d5e5b306f7"></p>',
  ].join(''),
},

// ─── PBS-103 ──────────────────────────────────────────────────────────────────
{
  seq: 103,
  id: '7f2e8c1b-5a3d-4e69-b08f-6c9a2d7e4b1c',
  html: [
    '<p class="editor-paragraph-block" data-id="82252415-d38c-4953-9f7f-a322ee505348">',
      'For example:<br>',
      'If a Pairing spans from late May 2026 to early June 2026, how should the Credit Hours for that Pairing be attributed to the two adjacent months?<br>',
      'If within that Pairing there is a Duty that crosses from June 30 to early July, how should those Credit Hours be split?',
      '<br>',
      '如：<br>',
      '某Pairing 从26年5月末 跨到 26年6月初，该 Pairing 对应的 Credit Hour 如何划分到 相邻的两个月？<br>',
      '若 该Pairing 中还存在某个 Duty 恰好 从6月30日 跨到 7月初，应该如何将 Credit Hour 进行 划分？',
    '</p>',
  ].join(''),
},

// ─── PBS-109 ──────────────────────────────────────────────────────────────────
{
  seq: 109,
  id: 'f1d4e7a2-3c8b-4f0e-9a6d-2b5c8e1f7a3d',
  html: [
    '<p class="editor-paragraph-block" data-id="c6136744-ddb9-4649-bda5-f3f45c200336">',
      'From <a target="_blank" class="text-accent-secondary underline underline-offset-[3px] hover:text-accent-primary transition-colors cursor-pointer" href="https://crew-f8-usva-tst.roiscloud.com/flair/browse/PBS-102/" rel="noopener noreferrer">https://crew-f8-usva-tst.roiscloud.com/flair/browse/PBS-102/</a>',
    '</p>',
    '<p class="editor-paragraph-block" data-id="1edf9d97-4955-4a96-91b8-d2a14fe47c15">',
      'Jen hopes the Beijing team can meet with the OR team next Wednesday evening — there are initial results now, with more to discuss:',
      '<br>',
      'Jen 希望北京下周三晚上需要和OR 团队交流一下 , 目前有初始结果了, 可以交流的更多了:',
    '</p>',
    '<ol class="list-decimal pl-7 space-y-(--list-spacing-y)" data-id="2d44724f-8053-461e-b6bb-9252e6ac3846">',
      '<li class="not-prose space-y-2" data-id="8ed2f717-0114-4c48-b394-f35b0d6516a5">',
        '<p class="editor-paragraph-block" data-id="3f492860-049f-44e5-84fe-754effc3cfe6">',
          '<s>Overall flying hours are too low (need to first analyze the available number of pairings)</s>',
          '<br>',
          '<s>整体飞时偏低 (我们得先分析一下可用的任务环数量)</s>',
        '</p>',
      '</li>',
      '<li class="not-prose space-y-2" data-id="689d70a5-3227-4e85-8f36-14275efea68d">',
        '<p class="editor-paragraph-block" data-id="db098c13-8c5f-4bc3-ac6a-918cac5cf4f1">',
          'No single-day RES desired (minimum 2 consecutive days)',
          '<br>',
          '不希望要有单天的RES (最少连续2天) ',
        '</p>',
      '</li>',
      '<li class="not-prose space-y-2" data-id="23da7420-b216-4a0c-9d10-6c7356f98698">',
        '<p class="editor-paragraph-block" data-id="b9ba64c0-881d-4efa-9751-57b0bc36d3b3">',
          '<s>If crew don\'t like any pairing, what would OR do? Who does it get assigned to?</s>',
          '<br>',
          '<s>如果任务环crew 都不喜欢, 哪OR会如何做? 分配给谁</s>',
        '</p>',
      '</li>',
      '<li class="not-prose space-y-2" data-id="7fa18094-ffb5-4daf-8b0b-ee0091322377">',
        '<p class="editor-paragraph-block" data-id="61668eef-cb4a-4642-b5b3-66be3e5f4d61">',
          '<s>How does the optimizer handle soft rules?</s>',
          '<br>',
          '<s>优化如何处理软性法规</s>',
        '</p>',
      '</li>',
    '</ol>',
  ].join(''),
},

] // end ITEMS

// Resolve IDs from zh-descs.json scan (more reliable than hardcoded guesses)
const fs = await import('node:fs')
const scanned = JSON.parse(fs.readFileSync(OUT + 'zh-descs.json', 'utf8'))
const idMap = Object.fromEntries(scanned.map(i => [i.seq, i.id]))
for (const it of ITEMS) it.id = idMap[it.seq] || it.id

// ─── PATCH ────────────────────────────────────────────────────────────────────
const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext({ ignoreHTTPSErrors: true, storageState: AUTH })
const page = await ctx.newPage()
await page.goto(`${BASE}/${SLUG}/projects/${PROJECT}/issues/`, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForTimeout(1500)

let ok = 0
for (const it of ITEMS) {
  const r = await page.evaluate(async ({ slug, project, id, html }) => {
    const csrf = document.cookie.split('; ').find(c => c.startsWith('csrftoken='))?.split('=')[1]
    const res = await fetch(`/api/workspaces/${slug}/projects/${project}/issues/${id}/`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', accept: 'application/json', 'x-csrftoken': csrf || '' },
      credentials: 'same-origin',
      body: JSON.stringify({ description_html: html }),
    })
    return { status: res.status }
  }, { slug: SLUG, project: PROJECT, id: it.id, html: it.html })
  const pass = r.status === 204 || r.status === 200
  console.log(`PBS-${it.seq}: ${r.status} ${pass ? 'OK' : '!!'}`)
  if (pass) ok++
  await page.waitForTimeout(300)
}

console.log(`\nDONE: ${ok}/${ITEMS.length} succeeded`)
await browser.close()
