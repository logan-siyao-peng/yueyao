# 越 & 尧 · 婚礼网站

## 本地预览

运行 `python3 server.py`，打开 [本地婚礼网站](http://127.0.0.1:8000/)。相册按拍摄年月排序，每两秒横向播放一张，可暂停、手动切换或横向滑动。首页的示意主图需要访问 Unsplash。

## 出席回执

每次提交都会新增一条记录，储存在仓库中的 `.wedding-data/rsvps.sqlite3`。该目录已加入 Git 忽略规则。导出时运行 `python3 server.py --export > rsvps.csv`，时间为 UTC。

公开版本通过 GitHub Pages 发布到 [yueyao.de](https://yueyao.de/)。GitHub Pages 提供静态页面，公开站会显示「出席回执即将开放」。本地 Python 预览可以提交和导出回执。

## 婚礼信息与照片

`index.html` 包含日期、场地、常见问题及相册双语文案。相册图像使用 `public/gallery/` 下压缩并移除元数据的副本，首屏照片在 `public/style.css` 内设置。确定日期与场地后，可以补充地图、交通与住宿、当日流程及回执截止日。

## 网站语言

首页默认显示中文。顶部的「中文 / English」按钮可切换整站语言，同一浏览器会记住选择。更新页面文字时，请同步更新对应的 `data-en` 英文内容。
