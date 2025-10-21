// ==UserScript==
// @name         bigcomics_comic_downloader
// @namespace
// @version      2025-06-12
// @description  狠狠下载
// @author       DHM
// @match        https://bigcomics.jp/episodes/*
// @grant        GM_download
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    const CONFIG = {
        viewerContainer: '#comici-viewer',
        pagesWrap: '#xCVPages',
        pageCanvas: '.-cv-page-canvas canvas',
        pageItem: '.-cv-page',
        renderedClass: 'mode-rendered',
        getTotalPages() {
            const pageCountEl = document.getElementById('articleImageCount-2268');
            return pageCountEl ? parseInt(pageCountEl.textContent) : 99;
        },
        isValidPage(canvas) {
            return canvas.width > 500 && canvas.height > 800;
        },
        controlStyle: {
            panel: `
                position: fixed; top: 20px; right: 20px; z-index: 99999;
                background: #fff; padding: 15px; border-radius: 8px;
                box-shadow: 0 2px 15px rgba(0,0,0,0.2);
                width: 320px; max-height: 600px; overflow-y: auto;
            `,
            btn: `
                margin: 5px 0; padding: 8px 16px; border: none; border-radius: 4px;
                cursor: pointer; font-weight: bold; transition: all 0.3s; width: 100%;
            `,
            downloadBtn: `background: #2196F3; color: #fff;`,
            clearBtn: `background: #f44336; color: #fff;`,
            status: `margin-top: 10px; font-size: 12px; color: #666; text-align: center;`,
            title: `
                margin: 0 0 15px; padding-bottom: 8px; border-bottom: 1px solid #eee;
                font-size: 16px; color: #333; text-align: center;
            `,
            imgList: `
                display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px;
                list-style: none; padding: 0; margin: 15px 0 0;
            `,
            imgItem: `
                border: 1px solid #eee; border-radius: 4px; overflow: hidden;
                position: relative; background: #f9f9f9; cursor: pointer;
                transition: transform 0.2s, box-shadow 0.2s;
            `,
            imgItemHover: `
                transform: scale(1.02); box-shadow: 0 2px 8px rgba(0,0,0,0.15);
            `,
            thumbnail: `
                width: 100%; height: 100px; object-fit: contain;
                background: #f0f0f0;
            `,
            pageLabel: `
                position: absolute; bottom: 3px; left: 3px;
                background: rgba(0,0,0,0.6); color: white; font-size: 11px;
                padding: 1px 5px; border-radius: 2px;
            `,
            previewOverlay: `
                position: fixed; top: 0; left: 0; width: 100%; height: 100%;
                background: rgba(0,0,0,0.9); z-index: 100000; display: flex;
                align-items: center; justify-content: center; padding: 20px;
                box-sizing: border-box;
            `,
            previewImg: `
                max-width: 90%; max-height: 90vh; object-contain;
                box-shadow: 0 0 20px rgba(0,0,0,0.3);
            `,
            closeBtn: `
                position: absolute; top: 20px; right: 20px;
                background: #fff; color: #000; border: none; border-radius: 50%;
                width: 36px; height: 36px; font-size: 20px; cursor: pointer;
                display: flex; align-items: center; justify-content: center;
                transition: background 0.2s;
            `,
            closeBtnHover: `
                background: #ff4444; color: white;
            `,
            pageInfo: `
                position: absolute; bottom: 20px; left: 50%; transform: translateX(-50%);
                background: rgba(0,0,0,0.7); color: white; padding: 5px 15px;
                border-radius: 20px; font-size: 14px;
            `
        }
    };

    let imageCache = new Map();
    const TOTAL_PAGES = CONFIG.getTotalPages();
    let imgListEl, statusEl;

    function init() {
        createControlPanel();
        observePageRender();
        window.addEventListener('scroll', debounce(scanRenderedPages, 300));
        console.log(`提取器初始化完成,预计总页数:${TOTAL_PAGES}`);
    }

    function createControlPanel() {
        const panel = document.createElement('div');
        panel.style.cssText = CONFIG.controlStyle.panel;
        panel.id = 'comicImageExtractorPanel';

        const title = document.createElement('h3');
        title.textContent = 'Bigcomics漫画提取器';
        title.style.cssText = CONFIG.controlStyle.title;
        panel.appendChild(title);

        const downloadBtn = document.createElement('button');
        downloadBtn.textContent = '批量下载';
        downloadBtn.style.cssText = `${CONFIG.controlStyle.btn} ${CONFIG.controlStyle.downloadBtn}`;
        downloadBtn.addEventListener('click', downloadAllImages);
        panel.appendChild(downloadBtn);

        const clearBtn = document.createElement('button');
        clearBtn.textContent = '清空缓存';
        clearBtn.style.cssText = `${CONFIG.controlStyle.btn} ${CONFIG.controlStyle.clearBtn}`;
        clearBtn.addEventListener('click', () => {
            imageCache.clear();
            updateStatus(`当前缓存:${imageCache.size}/${TOTAL_PAGES}`);
            updateThumbnailList();
        });
        panel.appendChild(clearBtn);

        statusEl = document.createElement('div');
        statusEl.style.cssText = CONFIG.controlStyle.status;
        statusEl.id = 'extractorStatus';
        statusEl.textContent = `当前缓存:${imageCache.size}/${TOTAL_PAGES}(请先加载页面)`;
        panel.appendChild(statusEl);

        const previewTitle = document.createElement('div');
        previewTitle.innerHTML = '<strong style="font-size:13px;color:#555;">缓存预览(点击图片查看大图):</strong>';
        panel.appendChild(previewTitle);

        imgListEl = document.createElement('ul');
        imgListEl.style.cssText = CONFIG.controlStyle.imgList;
        panel.appendChild(imgListEl);

        const viewer = document.querySelector(CONFIG.viewerContainer);
        if (viewer) viewer.style.zIndex = '9999';

        document.body.appendChild(panel);
    }

    function updateThumbnailList() {
        if (!imgListEl) return;
        imgListEl.innerHTML = '';

        const sortedImages = Array.from(imageCache.entries()).sort((a, b) => a[0] - b[0]);
        if (sortedImages.length === 0) {
            imgListEl.innerHTML = `
                <li style="grid-column: 1 / -1; text-align:center; padding:20px 0; color:#999; font-size:12px;">
                    暂无缓存内容,请先翻页加载漫画
                </li>
            `;
            return;
        }

        sortedImages.forEach(([pageNum, dataUrl], index) => {
            const li = document.createElement('li');
            li.style.cssText = CONFIG.controlStyle.imgItem;

            li.onmouseover = () => {
                li.style.cssText = CONFIG.controlStyle.imgItem + CONFIG.controlStyle.imgItemHover;
            };
            li.onmouseout = () => {
                li.style.cssText = CONFIG.controlStyle.imgItem;
            };

            const img = document.createElement('img');
            img.style.cssText = CONFIG.controlStyle.thumbnail;
            img.src = dataUrl;
            img.alt = `第${pageNum}页`;
            img.onerror = () => {
                img.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZTBlMGUwIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIxNiIgdGV4dC1hbmNob3I9Im1pZGRsZSI+5paw5aKe5LuW5omLPC90ZXh0Pjwvc3ZnPg==';
            };
            li.appendChild(img);

            const label = document.createElement('div');
            label.style.cssText = CONFIG.controlStyle.pageLabel;
            const fileName = `${(index + 1).toString().padStart(2, '0')}.png`;
            label.innerText = fileName;
            li.appendChild(label);

            li.addEventListener('click', () => {
                showPreview(dataUrl, pageNum, sortedImages, index + 1);
            });

            imgListEl.appendChild(li);
        });
    }

    function showPreview(imgUrl, pageNum, allImages, currentIndex) {
        const existingPreview = document.querySelector('.preview-overlay');
        if (existingPreview) existingPreview.remove();

        const overlay = document.createElement('div');
        overlay.className = 'preview-overlay';
        overlay.style.cssText = CONFIG.controlStyle.previewOverlay;

        const closeBtn = document.createElement('button');
        closeBtn.style.cssText = CONFIG.controlStyle.closeBtn;
        closeBtn.innerText = '×';
        closeBtn.onmouseover = () => closeBtn.style.cssText = CONFIG.controlStyle.closeBtn + CONFIG.controlStyle.closeBtnHover;
        closeBtn.onmouseout = () => closeBtn.style.cssText = CONFIG.controlStyle.closeBtn;
        closeBtn.onclick = () => overlay.remove();

        const pageInfo = document.createElement('div');
        pageInfo.style.cssText = CONFIG.controlStyle.pageInfo;
        const fileName = `${currentIndex.toString().padStart(2, '0')}.png`;
        pageInfo.innerText = `第${pageNum}页(共${allImages.length}页)|下载文件名:${fileName}`;

        const img = document.createElement('img');
        img.style.cssText = CONFIG.controlStyle.previewImg;
        img.src = imgUrl;
        img.alt = `预览第${pageNum}页`;

        overlay.appendChild(closeBtn);
        overlay.appendChild(pageInfo);
        overlay.appendChild(img);

        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) overlay.remove();
        });

        const handleEsc = (e) => {
            if (e.key === 'Escape') {
                overlay.remove();
                document.removeEventListener('keydown', handleEsc);
            }
        };
        document.addEventListener('keydown', handleEsc);

        document.body.appendChild(overlay);
    }

    function observePageRender() {
        const pagesWrap = document.querySelector(CONFIG.pagesWrap);
        if (!pagesWrap) return console.error('未找到分页容器');

        scanRenderedPages();

        const observer = new MutationObserver((mutations) => {
            mutations.forEach(mutation => {
                if (mutation.addedNodes.length) {
                    mutation.addedNodes.forEach(node => {
                        if (node.matches && node.matches(CONFIG.pageItem)) {
                            watchPageRender(node);
                        }
                    });
                }
            });
        });

        observer.observe(pagesWrap, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['class']
        });
    }

    function watchPageRender(pageEl) {
        const checkRender = () => {
            if (pageEl.classList.contains(CONFIG.renderedClass)) {
                extractCanvasImage(pageEl);
                renderObserver.disconnect();
            }
        };

        checkRender();
        const renderObserver = new MutationObserver(checkRender);
        renderObserver.observe(pageEl, { attributes: true, attributeFilter: ['class'] });
    }

    function scanRenderedPages() {
        const renderedPages = document.querySelectorAll(`${CONFIG.pageItem}.${CONFIG.renderedClass}`);
        renderedPages.forEach(pageEl => extractCanvasImage(pageEl));
        updateStatus(`当前缓存:${imageCache.size}/${TOTAL_PAGES}`);
        updateThumbnailList();
    }

    function extractCanvasImage(pageEl) {
        const canvas = pageEl.querySelector(CONFIG.pageCanvas);
        if (!canvas || !CONFIG.isValidPage(canvas)) return;

        const allPages = Array.from(document.querySelectorAll(CONFIG.pageItem));
        const pageIndex = allPages.indexOf(pageEl) + 1;

        if (imageCache.has(pageIndex)) return;

        try {
            const dataUrl = canvas.toDataURL('image/png', 1.0);
            imageCache.set(pageIndex, dataUrl);
            updateStatus(`当前缓存:${imageCache.size}/${TOTAL_PAGES}`);
            updateThumbnailList();
        } catch (e) {
            console.error(`提取第${pageIndex}页失败:`, e);
        }
    }

    function downloadAllImages() {
        if (imageCache.size === 0) {
            alert('未检测到缓存的图片,请先翻页加载漫画');
            return;
        }

        const sortedImages = Array.from(imageCache.entries()).sort((a, b) => a[0] - b[0]);
        sortedImages.forEach(([_, dataUrl], index) => {
            setTimeout(() => {
                const fileName = `${(index + 1).toString().padStart(2, '0')}.png`;
                GM_download({
                    url: dataUrl,
                    name: fileName,
                    mimetype: 'image/png',
                    onload: () => console.debug(`下载完成:${fileName}`),
                    onerror: (err) => console.error(`下载失败:${fileName}`, err)
                });
            }, index * 300);
        });

        updateStatus(`当前缓存:${imageCache.size}/${TOTAL_PAGES}`);
    }

    function updateStatus(text) {
        const statusEl = document.getElementById('extractorStatus');
        if (statusEl) statusEl.textContent = text;
    }

    function debounce(func, wait) {
        let timeout;
        return (...args) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), wait);
        };
    }

    init();
})();