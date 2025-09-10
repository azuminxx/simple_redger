(function() {
    'use strict';

    /**
     * SeatMap: 座席表コントローラ（Fabric.js + Plain JS）
     * - 既存コードと分離。kintone REST API を直接利用。
     */
    class SeatMap {
        constructor() {
            this.canvas = null;
            this.root = null;
            this.isEditing = false;
            this.currentSiteFloor = null; // 例: "池袋CO19F"
            this.records = []; // 座席台帳の表示対象レコード
            this.pendingUpdates = new Map(); // id -> {座標X, 座標Y, 幅, 高さ, 座席表表示}
            this.overlay = null;
            this.overlayNodes = new Map();
            this.zoomLevel = 1;
            // グリッド（編集補助）
            this.gridOverlay = null; // CSSグラデーション版
            this.gridCanvas = null;  // Canvas描画版
            this.gridSize = 20;      // 1マスのピクセル数
            // フォント自動調整用の基準
            this.baseSeatWidth = 120;
            this.baseSeatHeight = 84;
            this.baseTitleFont = 15; // 先頭行（座席番号）
            this.baseBodyFont = 13;  // 2行目以降
            this.minFont = 9;
            this.maxFont = 28;
            // サイズ計測ラベル
            this.measureLabels = new Map(); // id -> HTMLElement
            // 数値指定UI
            this.sizeWidthInput = null;
            this.sizeHeightInput = null;
            this.sizeApplyBtn = null;
            this.currentSelectedGroupId = null;
        }

        /**
         * 初期化
         */
        init(container) {
            if (!container) return;
            this.root = container;
            this.root.innerHTML = '';

            // コントロールパネル
            const controls = document.createElement('div');
            controls.className = 'seatmap-controls';

            // 座席フロアプルダウン（座席台帳の選択肢から動的生成）
            const select = document.createElement('select');
            select.className = 'seatmap-sitefloor';
            this.populateFloorOptions(select);

            const showBtn = document.createElement('button');
            showBtn.textContent = '表示';
            showBtn.addEventListener('click', () => {
                this.currentSiteFloor = select.value;
                this.loadAndRender(this.currentSiteFloor);
            });

            const editToggle = document.createElement('button');
            editToggle.textContent = '編集モード: OFF';
            editToggle.addEventListener('click', () => {
                this.isEditing = !this.isEditing;
                editToggle.textContent = `編集モード: ${this.isEditing ? 'ON' : 'OFF'}`;
                this.updateEditingMode();
            });

            const addBtn = document.createElement('button');
            addBtn.textContent = '追加(表示ON)';
            addBtn.addEventListener('click', () => this.addSeatFlow());

            const removeBtn = document.createElement('button');
            removeBtn.textContent = '削除(表示OFF)';
            removeBtn.addEventListener('click', () => this.removeSeatFlow());

            const autoLayoutBtn = document.createElement('button');
            autoLayoutBtn.textContent = '自動整列';
            autoLayoutBtn.addEventListener('click', () => this.autoLayout());

            const saveBtn = document.createElement('button');
            saveBtn.textContent = '保存';
            saveBtn.addEventListener('click', () => this.saveChanges());

            const zoomInBtn = document.createElement('button');
            zoomInBtn.textContent = 'ズーム+';
            zoomInBtn.addEventListener('click', () => this.zoom(1.1));

            const zoomOutBtn = document.createElement('button');
            zoomOutBtn.textContent = 'ズーム-';
            zoomOutBtn.addEventListener('click', () => this.zoom(0.9));

            const resetBtn = document.createElement('button');
            resetBtn.textContent = 'リセット';
            resetBtn.addEventListener('click', () => this.resetView());

            controls.appendChild(select);
            controls.appendChild(showBtn);
            controls.appendChild(editToggle);
            controls.appendChild(addBtn);
            controls.appendChild(removeBtn);
            controls.appendChild(autoLayoutBtn);
            controls.appendChild(saveBtn);
            controls.appendChild(zoomInBtn);
            controls.appendChild(zoomOutBtn);
            controls.appendChild(resetBtn);
            this.root.appendChild(controls);

            // 数値入力のサイズコントロール
            const sizeWrap = document.createElement('div');
            sizeWrap.className = 'seatmap-size-controls';
            sizeWrap.style.marginTop = '6px';
            sizeWrap.style.display = 'flex';
            sizeWrap.style.gap = '6px';
            sizeWrap.style.alignItems = 'center';
            const wLabel = document.createElement('span'); wLabel.textContent = '幅';
            const wInput = document.createElement('input'); wInput.type = 'number'; wInput.min = '40'; wInput.max = '1000'; wInput.step = '1'; wInput.style.width = '80px';
            const hLabel = document.createElement('span'); hLabel.textContent = '高さ';
            const hInput = document.createElement('input'); hInput.type = 'number'; hInput.min = '40'; hInput.max = '1000'; hInput.step = '1'; hInput.style.width = '80px';
            const applyBtn = document.createElement('button'); applyBtn.textContent = '適用';
            applyBtn.addEventListener('click', () => this.applySizeFromInputs());
            sizeWrap.appendChild(wLabel); sizeWrap.appendChild(wInput); sizeWrap.appendChild(hLabel); sizeWrap.appendChild(hInput); sizeWrap.appendChild(applyBtn);
            this.root.appendChild(sizeWrap);
            this.sizeWidthInput = wInput; this.sizeHeightInput = hInput; this.sizeApplyBtn = applyBtn;

            // Canvas コンテナ
            const canvasWrap = document.createElement('div');
            canvasWrap.className = 'seatmap-canvas-wrap';
            canvasWrap.style.width = '100%';
            canvasWrap.style.height = '600px';
            canvasWrap.style.border = '1px solid #ddd';
            canvasWrap.style.position = 'relative';
            const canvasEl = document.createElement('canvas');
            canvasEl.id = 'seatmap-canvas';
            // 枠線をグリッドより前面に表示するため、座席CanvasをグリッドCanvasより高いz-indexに設定
            canvasEl.style.position = 'relative';
            canvasEl.style.zIndex = '9';
            canvasWrap.appendChild(canvasEl);
            this.root.appendChild(canvasWrap);

            // Fabric Canvas
            if (!window.fabric) {
                console.error('fabric.js が読み込まれていません');
                return;
            }
            this.canvas = new fabric.Canvas('seatmap-canvas', {
                selection: true,
                preserveObjectStacking: true
            });
            this.resizeCanvas();
            window.addEventListener('resize', () => this.resizeCanvas());
            // グリッド（Canvasのみ）・オーバーレイ作成
            this.createGridCanvas();
            this.createOverlayLayer();

            // キーボード操作（矢印キー移動）
            this._keydownHandler = (e) => this.handleKeydown(e);
            document.addEventListener('keydown', this._keydownHandler, true);
        }

        // DOMグリッドは廃止（Canvasのみ使用）

        createGridCanvas() {
            const wrap = this.root.querySelector('.seatmap-canvas-wrap');
            if (!wrap) return;
            if (this.gridCanvas && this.gridCanvas.parentNode) this.gridCanvas.parentNode.removeChild(this.gridCanvas);
            const cvs = document.createElement('canvas');
            cvs.id = 'seatmap-grid-canvas';
            cvs.style.position = 'absolute';
            cvs.style.left = '0';
            cvs.style.top = '0';
            cvs.style.zIndex = '5'; // 座席Canvas(z=9)より背面に配置
            cvs.style.pointerEvents = 'none';
            cvs.style.transformOrigin = '0 0';
            wrap.appendChild(cvs);
            this.gridCanvas = cvs;
            this.redrawGridCanvas();
            this.gridCanvas.style.display = this.isEditing ? 'block' : 'none';
        }

        redrawGridCanvas() {
            const wrap = this.root.querySelector('.seatmap-canvas-wrap');
            if (!wrap || !this.gridCanvas) return;
            const rect = wrap.getBoundingClientRect();
            this.gridCanvas.width = rect.width;
            this.gridCanvas.height = rect.height;
            const ctx = this.gridCanvas.getContext('2d');
            if (!ctx) return;
            ctx.clearRect(0, 0, rect.width, rect.height);
            const size = this.gridSize;
            // 背景をわずかに青で塗る（検証目的）
            ctx.fillStyle = 'rgba(0,112,243,0.08)';
            ctx.fillRect(0, 0, rect.width, rect.height);
            // 細線
            ctx.strokeStyle = 'rgba(255,255,255,0.85)';
            ctx.lineWidth = 1;
            for (let x = 0.5; x <= rect.width; x += size) {
                ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, rect.height); ctx.stroke();
            }
            for (let y = 0.5; y <= rect.height; y += size) {
                ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(rect.width, y); ctx.stroke();
            }
            // 太線（5マス）
            ctx.strokeStyle = 'rgba(255,255,255,1.0)';
            ctx.lineWidth = 2;
            const major = size * 5;
            for (let x = 1; x <= rect.width; x += major) {
                ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, rect.height); ctx.stroke();
            }
            for (let y = 1; y <= rect.height; y += major) {
                ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(rect.width, y); ctx.stroke();
            }
        }

        createOverlayLayer() {
            const wrap = this.root.querySelector('.seatmap-canvas-wrap');
            if (!wrap) return;
            if (this.overlay && this.overlay.parentNode) {
                this.overlay.parentNode.removeChild(this.overlay);
            }
            const overlay = document.createElement('div');
            overlay.className = 'seatmap-overlay';
            overlay.style.position = 'absolute';
            overlay.style.left = '0';
            overlay.style.top = '0';
            overlay.style.right = '0';
            overlay.style.bottom = '0';
            overlay.style.zIndex = '10';
            overlay.style.transformOrigin = '0 0';
            overlay.style.userSelect = 'text';
            overlay.style.pointerEvents = this.isEditing ? 'none' : 'auto';
            wrap.appendChild(overlay);
            this.overlay = overlay;
            this.overlayNodes = new Map();
        }

        // サイズ計測用ラベルの更新/表示
        updateMeasureLabel(recordId, group, overrideW = null, overrideH = null) {
            try {
                if (!this.overlay) return;
                const id = String(recordId);
                let label = this.measureLabels.get(id);
                if (!label) {
                    label = document.createElement('div');
                    label.className = 'seat-measure-label';
                    label.style.position = 'absolute';
                    label.style.padding = '2px 6px';
                    label.style.background = 'rgba(0,0,0,0.75)';
                    label.style.color = '#fff';
                    label.style.fontSize = '12px';
                    label.style.borderRadius = '4px';
                    label.style.pointerEvents = 'none';
                    label.style.zIndex = '11';
                    this.overlay.appendChild(label);
                    this.measureLabels.set(id, label);
                }
                let w, h;
                if (overrideW !== null && overrideH !== null) {
                    w = Math.round(overrideW);
                    h = Math.round(overrideH);
                } else {
                    const rect = group.item(0);
                    w = Math.round((rect?.width || 0) * (rect?.scaleX || 1));
                    h = Math.round((rect?.height || 0) * (rect?.scaleY || 1));
                }
                label.textContent = `${w} × ${h}`;
                // 枠の右下に表示
                const left = Math.round(group.left + w + 8);
                const top = Math.round(group.top + h - 18);
                label.style.left = left + 'px';
                label.style.top = top + 'px';
                label.style.display = 'block';
            } catch (e) { /* noop */ }
        }

        hideMeasureLabel(recordId) {
            try {
                const id = String(recordId);
                const label = this.measureLabels.get(id);
                if (label) label.style.display = 'none';
            } catch (e) { /* noop */ }
        }

        applySizeFromInputs() {
            try {
                if (!this.currentSelectedGroupId) return;
                const id = String(this.currentSelectedGroupId);
                // 対応するFabricグループを探す
                const groups = this.canvas ? this.canvas.getObjects() : [];
                const target = groups.find(g => String(g._recordId) === id);
                if (!target) return;
                const newW = Math.max(40, Math.min(1000, parseInt(this.sizeWidthInput?.value || '0', 10) || 0));
                const newH = Math.max(40, Math.min(1000, parseInt(this.sizeHeightInput?.value || '0', 10) || 0));
                if (!newW || !newH) return;
                // グループ直下の枠Rectをサイズ変更
                target.set({ scaleX: 1, scaleY: 1 });
                const outer = target.item(0);
                outer.set({ width: newW, height: newH });
                // オーバーレイ/ラベル/フォント更新
                this.updateOverlayFromGroup(target);
                this.updateMeasureLabel(id, target, newW, newH); // 入力値をそのまま表示
                // 保存対象へ反映
                this.markUpdate(id, { 幅: newW, 高さ: newH });
                this.canvas.requestRenderAll();
            } catch (e) { /* noop */ }
        }

        handleKeydown(event) {
            try {
                if (!this.isEditing) return;
                if (!this.currentSelectedGroupId) return;
                const active = document.activeElement;
                if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)) return;
                const key = event.key;
                if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(key)) return;
                event.preventDefault();
                const step = event.shiftKey ? 10 : 1;
                const id = String(this.currentSelectedGroupId);
                const groups = this.canvas ? this.canvas.getObjects() : [];
                const target = groups.find(g => String(g._recordId) === id);
                if (!target) return;
                if (key === 'ArrowUp') target.top -= step;
                if (key === 'ArrowDown') target.top += step;
                if (key === 'ArrowLeft') target.left -= step;
                if (key === 'ArrowRight') target.left += step;
                target.left = Math.max(0, target.left);
                target.top = Math.max(0, target.top);
                target.setCoords();
                this.updateOverlayFromGroup(target);
                this.updateMeasureLabel(id, target);
                this.markUpdate(id, { 座標X: Math.round(target.left), 座標Y: Math.round(target.top) });
                this.canvas.requestRenderAll();
            } catch (e) { /* noop */ }
        }

        applyOverlayZoom() {
            try {
                if (this.overlay) {
                    this.overlay.style.transform = `scale(${this.zoomLevel})`;
                }
                // DOMグリッドは廃止
            } catch (e) { /* noop */ }
        }

        async populateFloorOptions(selectEl) {
            try {
                // 座席台帳(appId=8)のフィールドから「座席フロア」の選択肢を抽出
                const appId = '8';
                const fields = await window.fieldInfoAPI.getAppFields(appId);
                const floorField = fields.find(f => f.code === '座席フロア');
                const options = (floorField && Array.isArray(floorField.options)) ? floorField.options : [];
                selectEl.innerHTML = '';
                options.forEach(label => {
                    const opt = document.createElement('option');
                    opt.value = label; opt.textContent = label; selectEl.appendChild(opt);
                });
            } catch (e) {
                console.error('座席フロア選択肢の取得に失敗しました', e);
            }
        }

        destroy() {
            if (this.canvas) {
                this.canvas.dispose();
                this.canvas = null;
            }
            if (this.root) {
                this.root.innerHTML = '';
            }
            if (this._keydownHandler) {
                document.removeEventListener('keydown', this._keydownHandler, true);
                this._keydownHandler = null;
            }
            this.records = [];
            this.pendingUpdates.clear();
        }

        resizeCanvas() {
            if (!this.canvas) return;
            const wrap = this.root.querySelector('.seatmap-canvas-wrap');
            if (!wrap) return;
            const rect = wrap.getBoundingClientRect();
            this.canvas.setWidth(rect.width);
            this.canvas.setHeight(rect.height);
            this.canvas.requestRenderAll();
            // グリッド/オーバーレイのスケールを同期
            this.applyOverlayZoom();
            this.redrawGridCanvas();
        }

        updateEditingMode() {
            if (!this.canvas) return;
            this.canvas.selection = this.isEditing;
            this.canvas.forEachObject(obj => {
                obj.selectable = this.isEditing;
                obj.evented = this.isEditing;
                obj.hasControls = this.isEditing;
                obj.lockMovementX = !this.isEditing;
                obj.lockMovementY = !this.isEditing;
            });
            if (this.overlay) {
                this.overlay.style.pointerEvents = this.isEditing ? 'none' : 'auto';
            }
            if (!this.gridCanvas) this.createGridCanvas();
            if (this.gridCanvas) {
                this.gridCanvas.style.display = this.isEditing ? 'block' : 'none';
            }
            // 念のためスケールも同期
            this.applyOverlayZoom();
            this.canvas.requestRenderAll();
        }

        async loadAndRender(siteFloor) {
            try {
                // 1) 座席台帳（appId=8）を siteFloor（拠点+階相当）で検索 + 表示フラグtrue
                const appId = '8';
                const query = `(座席フロア in ("${siteFloor}")) and (座席表表示 in ("true")) order by 座席番号 asc`;
                const records = await this.fetchRecords(appId, query);
                this.records = records || [];

                // 2) 統合情報（PC/内線/注記）を突合
                const integrated = await this.integrate(records);

                // 3) 描画
                this.draw(integrated);
            } catch (e) {
                console.error('座席表の読み込みに失敗しました', e);
                alert('座席表の読み込みに失敗しました');
            }
        }

        async fetchRecords(appId, query) {
            const resp = await kintone.api(kintone.api.url('/k/v1/records', true), 'GET', { app: appId, query });
            return resp.records || [];
        }

        async integrate(seatRecords) {
            // 既存の DataIntegrator + SearchEngine を活用して、PC/内線を突合
            if (!window.dataIntegrator || !window.searchEngine) return seatRecords;

            // 統合キーから他台帳をまとめて抽出
            const integrationKeys = seatRecords
                .map(r => r[CONFIG.integrationKey]?.value)
                .filter(Boolean);
            const appIdSeat = '8';
            const allLedger = {};
            allLedger[appIdSeat] = seatRecords;
            // PC/内線は searchByPrimaryKeys を使う
            const pcAppId = Object.keys(CONFIG.apps).find(id => CONFIG.apps[id].name === 'PC台帳');
            const extAppId = Object.keys(CONFIG.apps).find(id => CONFIG.apps[id].name === '内線台帳');
            allLedger[pcAppId] = await window.dataIntegrator.searchByPrimaryKeys(pcAppId, integrationKeys);
            allLedger[extAppId] = await window.dataIntegrator.searchByPrimaryKeys(extAppId, integrationKeys);

            // 内線台帳の座席表注記を辞書化
            const noteField = '座席表注記';
            const extNoteByKey = new Map();
            (allLedger[extAppId] || []).forEach(r => {
                const ik = r[CONFIG.integrationKey]?.value;
                const note = r[noteField]?.value || '';
                if (ik) extNoteByKey.set(ik, note);
            });

            // マージ（必要な表示値だけ抽出）
            const pcByKey = new Map();
            (allLedger[pcAppId] || []).forEach(r => {
                const ik = r[CONFIG.integrationKey]?.value;
                if (ik) pcByKey.set(ik, r['PC番号']?.value || '');
            });
            const extByKey = new Map();
            (allLedger[extAppId] || []).forEach(r => {
                const ik = r[CONFIG.integrationKey]?.value;
                if (ik) extByKey.set(ik, r['内線番号']?.value || '');
            });

            return seatRecords.map(r => {
                const ik = r[CONFIG.integrationKey]?.value || '';
                return {
                    id: r['$id']?.value,
                    ik,
                    seatNo: r['座席番号']?.value || '',
                    dept: r['座席部署']?.value || '',
                    pcNo: pcByKey.get(ik) || '',
                    extNo: extByKey.get(ik) || '',
                    note: extNoteByKey.get(ik) || '',
                    x: Number(r['座標X']?.value || 0),
                    y: Number(r['座標Y']?.value || 0),
                    w: Number(r['幅']?.value || 120),
                    h: Number(r['高さ']?.value || 84),
                };
            });
        }

        updateOverlayFromGroup(group) {
            try {
                if (!group || !this.overlayNodes) return;
                const id = String(group._recordId);
                const node = this.overlayNodes.get(id);
                if (!node) return;
                const outerRect2 = group.item(0);
                const newW = Math.round((outerRect2?.width || 0) * (outerRect2?.scaleX || 1));
                const newH = Math.round((outerRect2?.height || 0) * (outerRect2?.scaleY || 1));
                node.style.left = Math.round(group.left) + 'px';
                node.style.top = Math.round(group.top) + 'px';
                node.style.width = newW + 'px';
                node.style.height = newH + 'px';
                // 文字サイズも自動調整
                const scaleW = Math.max(0.6, Math.min(2.2, newW / this.baseSeatWidth));
                const scaleH = Math.max(0.6, Math.min(2.2, newH / this.baseSeatHeight));
                const scale = Math.min(scaleW, scaleH);
                const rowDivs = node.querySelectorAll('div');
                rowDivs.forEach((div, idx) => {
                    const base = idx === 0 ? this.baseTitleFont : this.baseBodyFont;
                    const px = Math.max(this.minFont, Math.min(this.maxFont, Math.round(base * scale)));
                    div.style.fontSize = px + 'px';
                });
            } catch (e) { /* noop */ }
        }

        draw(items) {
            if (!this.canvas) return;
            this.canvas.clear();
            const objects = [];
            items.forEach(item => {
                const x = item.x || 0;
                const y = item.y || 0;
                const w = item.w || 120;
                const h = item.h || 84;
                const headerH = 0;
                const padding = 6;

                // 外枠（角丸＋淡い影で視認性を向上）
                const rect = new fabric.Rect({
                    left: 0,
                    top: 0,
                    originX: 'left',
                    originY: 'top',
                    width: w,
                    height: h,
                    rx: 8,
                    ry: 8,
                    fill: '#ffffff',
                    stroke: '#b6b6b6',
                    strokeWidth: 0,
                    objectCaching: false,
                    shadow: new fabric.Shadow({ color: 'rgba(0,0,0,0.12)', blur: 6, offsetX: 0, offsetY: 2 })
                });

                // 内部装飾は描画しない（枠のみ）
                const groupObjects = [rect];
                const group = new fabric.Group(groupObjects, { left: x, top: y, originX: 'left', originY: 'top', _recordId: item.id, objectCaching: false });

                const syncAfterTransform = () => {
                    // スケール後の見かけサイズを取得
                    const outerRect = group.item(0);
                    const stroke = outerRect?.strokeWidth || 0;
                    const visualW = Math.round(((outerRect?.width || 0) * (outerRect?.scaleX || 1)) + stroke);
                    const visualH = Math.round(((outerRect?.height || 0) * (outerRect?.scaleY || 1)) + stroke);
                    // スケールをリセットし、内部オブジェクトの実幅/実高を更新
                    group.set({ scaleX: 1, scaleY: 1 });
                    const outer = group.item(0); // 外枠Rect
                    outer.set({ width: Math.round(group.getScaledWidth()), height: Math.round(group.getScaledHeight()) });
                    // ヘッダーなし
                    // オーバーレイも反映
                    this.updateOverlayFromGroup(group);
                    // 更新内容を保存対象に反映
                    this.markUpdate(item.id, { 座標X: Math.round(group.left), 座標Y: Math.round(group.top), 幅: Math.round(group.getScaledWidth()), 高さ: Math.round(group.getScaledHeight()) });
                };

                const finalize = () => {
                    // Fabricの座標を確定させ、線とオーバーレイを最終位置で再計算
                    syncAfterTransform();
                    group.setCoords();
                    this.updateOverlayFromGroup(group);
                    // ラベルは選択中は表示継続
                    this.canvas.requestRenderAll();
                };
                group.on('modified', finalize);
                group.on('moved', finalize);
                group.on('scaled', finalize);
                group.on('moving',  () => { this.updateOverlayFromGroup(group); this.updateMeasureLabel(item.id, group); });
                group.on('scaling', () => { this.updateOverlayFromGroup(group); this.updateMeasureLabel(item.id, group); });
                group.on('selected', () => {
                    this.currentSelectedGroupId = item.id;
                    if (this.sizeWidthInput && this.sizeHeightInput) {
                        this.sizeWidthInput.value = String(Math.round(group.getScaledWidth()));
                        this.sizeHeightInput.value = String(Math.round(group.getScaledHeight()));
                    }
                    this.updateMeasureLabel(item.id, group);
                });
                group.on('deselected', () => { this.hideMeasureLabel(item.id); this.currentSelectedGroupId = null; });

                group.hasControls = true;
                group.lockScalingFlip = true;
                group.selectable = this.isEditing;
                group.evented = this.isEditing;
                objects.push(group);
            });
            this.canvas.add(...objects);
            this.canvas.requestRenderAll();
            this.updateEditingMode();

            // テキスト選択レイヤーを再構築
            this.renderOverlay(items);
        }

        renderOverlay(items) {
            if (!this.overlay) return;
            // クリア
            while (this.overlay.firstChild) this.overlay.removeChild(this.overlay.firstChild);
            this.overlayNodes.clear();

            items.forEach(item => {
                const x = item.x || 0;
                const y = item.y || 0;
                const w = item.w || 120;
                const h = item.h || 84;
                const headerH = 0;
                const padding = 6;

                const node = document.createElement('div');
                node.className = 'seat-overlay';
                node.style.position = 'absolute';
                node.style.left = x + 'px';
                node.style.top = y + 'px';
                node.style.width = w + 'px';
                node.style.height = h + 'px';
                node.style.cursor = 'text';
                node.style.background = 'transparent';
                node.style.color = '#000';
                node.style.fontFamily = 'Segoe UI, system-ui, -apple-system, Roboto, Arial';
                node.style.fontWeight = '500';

                // ヘッダーは廃止。座席番号は本文の先頭行で表示

                const rows = [item.seatNo || '', item.pcNo || '', item.extNo || '', item.dept || '', item.note || ''];
                const rowAreaH = h - headerH;
                const rowH = rowAreaH / rows.length;
                // フォントスケール（幅・高さ基準）
                const scaleW = Math.max(0.6, Math.min(2.2, w / this.baseSeatWidth));
                const scaleH = Math.max(0.6, Math.min(2.2, h / this.baseSeatHeight));
                const scale = Math.min(scaleW, scaleH);
                rows.forEach((text, i) => {
                    const div = document.createElement('div');
                    div.textContent = text;
                    div.style.position = 'absolute';
                    div.style.left = padding + 'px';
                    div.style.top = (headerH + i * rowH + (rowH - 14) / 2) + 'px';
                    div.style.width = Math.max(20, w - padding * 2) + 'px';
                    div.style.textAlign = 'left';
                    const base = i === 0 ? this.baseTitleFont : this.baseBodyFont;
                    const px = Math.max(this.minFont, Math.min(this.maxFont, Math.round(base * scale)));
                    div.style.fontSize = px + 'px';
                    div.style.fontWeight = i === 0 ? '600' : '400';
                    div.style.lineHeight = '14px';
                    node.appendChild(div);
                });

                this.overlay.appendChild(node);
                this.overlayNodes.set(String(item.id), node);
            });
            // pointerEvents: 編集時は非表示扱い
            this.overlay.style.pointerEvents = this.isEditing ? 'none' : 'auto';
        }

        markUpdate(id, fields) {
            if (!id) return;
            const cur = this.pendingUpdates.get(id) || {};
            this.pendingUpdates.set(id, { ...cur, ...fields });
        }

        async addSeatFlow() {
            try {
                const candidate = await this.pickSeatCandidate(false);
                if (!candidate) return;
                this.pendingUpdates.set(candidate.id, { '座席表表示': 'true' });
                alert('追加対象に設定しました。保存を実行してください。');
            } catch (e) { console.error(e); }
        }

        async removeSeatFlow() {
            try {
                const candidate = await this.pickSeatCandidate(true);
                if (!candidate) return;
                this.pendingUpdates.set(candidate.id, { '座席表表示': 'false' });
                alert('削除対象に設定しました。保存を実行してください。');
            } catch (e) { console.error(e); }
        }

        async pickSeatCandidate(currentlyVisible) {
            // 簡易実装: 対象一覧を取得して prompt で選択（将来UI化）
            const appId = '8';
            const visCond = currentlyVisible ? 'true' : 'false';
            const query = `(座席フロア in ("${this.currentSiteFloor}")) and (座席表表示 in ("${visCond}")) order by 座席番号 asc limit 500`;
            const recs = await this.fetchRecords(appId, query);
            if (!recs || recs.length === 0) { alert('候補がありません'); return null; }
            const labels = recs.map(r => `${r['$id'].value}:${r['座席番号']?.value || ''}`);
            const chosen = prompt('対象を選択してください（id:座席番号）:\n' + labels.join('\n'));
            if (!chosen) return null;
            const id = String(chosen.split(':')[0]);
            const rec = recs.find(r => String(r['$id'].value) === id);
            if (!rec) return null;
            return { id, rec };
        }

        autoLayout() {
            if (!this.canvas) return;
            const padding = 10;
            const containerWidth = this.canvas.getWidth();
            const seatW = 120, seatH = 84, gap = 10;
            const perRow = Math.max(1, Math.floor((containerWidth - padding * 2 + gap) / (seatW + gap)));
            let x = padding, y = padding, count = 0;
            this.canvas.getObjects().forEach(group => {
                group.left = x; group.top = y;
                const rect = group.item(0);
                rect.set({ width: seatW, height: seatH, scaleX: 1, scaleY: 1 });
                // 内部線やヘッダーは廃止
                this.updateOverlayFromGroup(group);
                this.markUpdate(group._recordId, { 座標X: Math.round(x), 座標Y: Math.round(y), 幅: seatW, 高さ: seatH });
                count += 1;
                if (count % perRow === 0) { x = padding; y += seatH + gap; }
                else { x += seatW + gap; }
            });
            this.canvas.requestRenderAll();
        }

        async saveChanges() {
            if (this.pendingUpdates.size === 0) { alert('保存対象がありません'); return; }
            const records = [];
            for (const [id, fields] of this.pendingUpdates.entries()) {
                const record = {};
                Object.entries(fields).forEach(([k, v]) => {
                    record[k] = { value: v };
                });
                records.push({ id: Number(id), record });
            }
            try {
                // PUTで座席台帳へ一括更新
                await kintone.api(kintone.api.url('/k/v1/records', true), 'PUT', {
                    app: 8,
                    records
                });
                alert('保存しました');
                this.pendingUpdates.clear();
                if (this.currentSiteFloor) {
                    // 反映後の値を正しく再描画（キャッシュ等の影響を避けるため少し待機）
                    await new Promise(r => setTimeout(r, 150));
                    await this.loadAndRender(this.currentSiteFloor);
                }
            } catch (e) {
                console.error(e);
                alert('保存に失敗しました');
            }
        }

        zoom(factor) {
            if (!this.canvas) return;
            const vp = this.canvas.getZoom();
            const newZoom = Math.min(4, Math.max(0.2, vp * factor));
            this.canvas.setZoom(newZoom);
            this.zoomLevel = newZoom;
            if (this.overlay) this.overlay.style.transform = `scale(${this.zoomLevel})`;
            if (this.gridCanvas) this.gridCanvas.style.transform = `scale(${this.zoomLevel})`;
            this.canvas.requestRenderAll();
        }

        resetView() {
            if (!this.canvas) return;
            this.canvas.setViewportTransform([1,0,0,1,0,0]);
            this.canvas.setZoom(1);
            this.zoomLevel = 1;
            if (this.overlay) this.overlay.style.transform = 'scale(1)';
            if (this.gridCanvas) this.gridCanvas.style.transform = 'scale(1)';
            this.canvas.requestRenderAll();
        }
    }

    // グローバル公開
    window.SeatMap = SeatMap;
})();


