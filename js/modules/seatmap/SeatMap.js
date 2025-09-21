/**
 * 座席表（Konva版）
 * - 左: 座席リスト / 右: MAP(Stage)
 * - 本ファイルはスケルトン。データ取得や保存は後続タスクで実装
 */
(function() {
	'use strict';

	class SeatMap {
		constructor() {
			this.stage = null;
			this.layer = null;
			this.transformer = null;
			this.container = null;
			this.stageContainer = null;
			this.leftListContainer = null;
			this.leftListEl = null;
			this.filterInputEl = null;
			this.siteSelectEl = null;
			this.floorInputEl = null;
			this.initialized = false;
			this.overlayContainer = null;
			this.overlayById = new Map();
			this.isEditing = false;
			this.gridLayer = null;
			this.gridSize = 10;
			this.snapStep = 10;
			this.hudLayer = null;
			this.sizeLabelById = new Map();
			this.loadingEl = null;
			this.dropPreview = null;
			this._draggingFromList = false;
			this.seatIdToNode = new Map();
			this.pendingChanges = new Map(); // recordId -> { x,y,w,h,display }
			this.fixedSeatSize = 100;
			this.snapEnabled = true;
		}

		buildTabContent() {
			// ルート
			const root = document.createElement('div');
			root.className = 'seatmap-container';

			// 上部コントロール
			const controls = document.createElement('div');
			controls.className = 'seatmap-controls';
			controls.appendChild(this._buildControls());
			root.appendChild(controls);

			// 2ペインレイアウト
			const layout = document.createElement('div');
			layout.className = 'seatmap-layout';

			// 左リスト
			const left = document.createElement('div');
			left.className = 'seatmap-left';
			left.appendChild(this._buildSeatListSkeleton());
			layout.appendChild(left);
			this.leftListContainer = left;

			// 右ステージ
			const right = document.createElement('div');
			right.className = 'seatmap-right';
			const stageWrap = document.createElement('div');
			stageWrap.className = 'seatmap-stage-wrapper';
			const stageDiv = document.createElement('div');
			stageDiv.className = 'seatmap-stage';
			stageDiv.id = 'seatmap-stage-' + Date.now();
			stageWrap.appendChild(stageDiv);
			right.appendChild(stageWrap);
			layout.appendChild(right);
			this.stageContainer = stageDiv;

			root.appendChild(layout);
			this.container = root;
			// 拠点選択肢（静的）初期化は不要
			return root;
		}

		_buildControls() {
			const wrap = document.createElement('div');
			wrap.className = 'seatmap-controls-inner';

			// 拠点+階（CONFIGから静的選択肢）
			const siteSelect = document.createElement('select');
			siteSelect.className = 'seatmap-select';
			this.siteSelectEl = siteSelect;
			const opts = (CONFIG.seatMap && CONFIG.seatMap.siteFloorOptions) || [];
			const emptyOpt = document.createElement('option'); emptyOpt.value = ''; emptyOpt.textContent = '拠点+階'; siteSelect.appendChild(emptyOpt);
			opts.forEach(v => { const o = document.createElement('option'); o.value = v; o.textContent = v; siteSelect.appendChild(o); });
			// 階入力は廃止
			this.floorInputEl = null;

			// 検索フォーム（文字列）
			const searchInput = document.createElement('input');
			searchInput.type = 'text';
			searchInput.placeholder = '文字列検索（座席/内線/PC/部署）';
			searchInput.className = 'seatmap-select';
			const searchBtn = document.createElement('button');
			searchBtn.className = 'seatmap-btn';
			searchBtn.textContent = '検索';
			searchBtn.addEventListener('click', () => this.highlightTexts(searchInput.value || ''));

			const showBtn = document.createElement('button');
			showBtn.className = 'seatmap-btn primary';
			showBtn.textContent = '表示';
			showBtn.addEventListener('click', () => {
				const token = this.siteSelectEl ? this.siteSelectEl.value : '';
				const parsed = this._parseSiteFloorToken(token);
				this.loadAndRender(parsed);
			});

			const editToggle = document.createElement('button');
			editToggle.className = 'seatmap-btn';
			editToggle.textContent = '編集OFF';
			editToggle.addEventListener('click', () => {
				const editing = editToggle.getAttribute('data-editing') === 'true';
				if (editing) {
					this.exitEditMode();
					editToggle.setAttribute('data-editing','false');
					editToggle.textContent = '編集OFF';
				} else {
					this.enterEditMode();
					editToggle.setAttribute('data-editing','true');
					editToggle.textContent = '編集ON';
				}
			});

			const saveBtn = document.createElement('button');
			saveBtn.className = 'seatmap-btn success';
			saveBtn.textContent = '保存';
			saveBtn.addEventListener('click', () => this.saveChanges());

			const zoomOutBtn = document.createElement('button');
			zoomOutBtn.className = 'seatmap-btn';
			zoomOutBtn.textContent = '－';
			zoomOutBtn.addEventListener('click', () => this.zoomOut());

			const zoomInBtn = document.createElement('button');
			zoomInBtn.className = 'seatmap-btn';
			zoomInBtn.textContent = '＋';
			zoomInBtn.addEventListener('click', () => this.zoomIn());

			const resetBtn = document.createElement('button');
			resetBtn.className = 'seatmap-btn';
			resetBtn.textContent = 'リセット';
			resetBtn.addEventListener('click', () => this.resetView());

			wrap.appendChild(siteSelect);
			// floor入力は削除
			wrap.appendChild(showBtn);
			wrap.appendChild(searchInput);
			wrap.appendChild(searchBtn);
			wrap.appendChild(editToggle);
			wrap.appendChild(saveBtn);
			wrap.appendChild(zoomOutBtn);
			wrap.appendChild(zoomInBtn);
			wrap.appendChild(resetBtn);
			return wrap;
		}

		_buildSeatListSkeleton() {
			const wrapper = document.createElement('div');
			wrapper.className = 'seatlist-wrapper';

			const header = document.createElement('div');
			header.className = 'seatlist-header';
			header.textContent = '座席リスト（未配置）';

			const filterWrap = document.createElement('div');
			filterWrap.className = 'seatlist-filter';
			const input = document.createElement('input');
			input.type = 'text';
			input.placeholder = '座席番号/部署で絞込';
			filterWrap.appendChild(input);
			this.filterInputEl = input;

			const list = document.createElement('div');
			list.className = 'seatlist-list';
			list.id = 'seatlist-list-' + Date.now();
			this.leftListEl = list;
			// 初期表示は空。表示ボタン押下後に実データを描画

			// フィルタイベント
			this.filterInputEl.addEventListener('input', () => this._applyListFilter());

			wrapper.appendChild(header);
			wrapper.appendChild(filterWrap);
			wrapper.appendChild(list);
			return wrapper;
		}

		_showLoading(text) {
			try {
				if (!this.stageContainer) return;
				let el = this.loadingEl;
				if (!el) {
					el = document.createElement('div');
					el.className = 'seatmap-loading';
					el.textContent = text || '読み込み中...';
					this.stageContainer.parentElement.appendChild(el);
					this.loadingEl = el;
				} else {
					el.textContent = text || '読み込み中...';
					el.style.display = 'flex';
				}
			} catch (_) { /* noop */ }
		}

		_hideLoading() {
			try {
				if (this.loadingEl) this.loadingEl.style.display = 'none';
			} catch (_) { /* noop */ }
		}

		async loadAndRender(siteFloor) {
			// Stage生成 + DnD準備 + 左リスト実データ化
			this._showLoading('座席表を読み込み中...');
			this._ensureStage();
			this._bindDomDnd();
			// 前回のMAPをクリア
			this._clearMap();
			// 左リスト（未配置）を更新
			await this._loadLeftSeatList(siteFloor);
			// 右MAP（配置済み=true）を再描画
			const { site, floor } = this._parseSiteFloor(siteFloor);
			await this._loadMapSeats(site, floor);
			this._alignViewTopLeft(0.8);
			this.initialized = true;
			this._hideLoading();
		}

		_bindDomDnd() {
			if (this._dndBound) return;
			const list = this.leftListEl;
			if (list) {
				list.addEventListener('dragstart', (e) => {
					const item = e.target && e.target.closest('.seat-item');
					if (!item) return;
					const payload = item.getAttribute('data-seat');
					if (payload && e.dataTransfer) {
						e.dataTransfer.setData('application/json+seat', payload);
						e.dataTransfer.effectAllowed = 'copy';
					}
					this._draggingFromList = true;
				});
				list.addEventListener('dragend', () => { this._hideDropPreview(); });
			}
			if (this.stageContainer) {
				this.stageContainer.addEventListener('dragenter', (e) => {
					if (!this._draggingFromList) return;
					e.preventDefault();
					this._ensureDropPreview();
				});
				this.stageContainer.addEventListener('dragover', (e) => {
					e.preventDefault();
					if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
					if (!this._draggingFromList) return;
					const pt = this._toStagePoint(e.clientX, e.clientY);
					const step = this.snapStep || 10;
					const nx = Math.round(pt.x / step) * step;
					const ny = Math.round(pt.y / step) * step;
					this._ensureDropPreview();
					this.dropPreview.position({ x: nx, y: ny });
					this.stage && this.stage.batchDraw();
				});
				this.stageContainer.addEventListener('drop', (e) => {
					e.preventDefault();
					const json = e.dataTransfer ? e.dataTransfer.getData('application/json+seat') : '';
					if (!json) return;
					let seat;
					try { seat = JSON.parse(json); } catch(_) { return; }
					const pt = this._toStagePoint(e.clientX, e.clientY);
					const step = this.snapStep || 10;
					const stagePoint = { x: Math.round(pt.x / step) * step, y: Math.round(pt.y / step) * step };
					this.addSeat(seat, stagePoint);
					// 左リストから削除
					try {
						const selector = `.seat-item[data-seat-id="${String(seat.recordId)}"]`;
						const el = this.leftListEl && this.leftListEl.querySelector(selector);
						if (el && el.parentNode) el.parentNode.removeChild(el);
					} catch (_) { /* noop */ }
					this._hideDropPreview();
				});
				this.stageContainer.addEventListener('dragleave', (e) => {
					// コンテナ外に出たら隠す
					if (!this.stageContainer.contains(e.relatedTarget)) {
						this._hideDropPreview();
					}
				});
			}
			this._dndBound = true;
		}

		_ensureDropPreview() {
			try {
				if (this.dropPreview) { this.dropPreview.visible(true); this.dropPreview.moveToTop(); return; }
				if (!this.layer) return;
				const g = this.fixedSeatSize;
				this.dropPreview = new Konva.Group({ listening: false, name: 'drop-preview' });
				this.dropPreview.add(new Konva.Rect({ x: 0, y: 0, width: g, height: g, stroke: '#1976d2', dash: [6,4], strokeWidth: 2 }));
				this.layer.add(this.dropPreview);
				this.dropPreview.moveToTop();
				this.stage && this.stage.batchDraw();
			} catch (_) { /* noop */ }
		}

		_hideDropPreview() {
			try {
				if (this.dropPreview) { this.dropPreview.visible(false); this.layer && this.layer.batchDraw(); }
				this._draggingFromList = false;
			} catch (_) { /* noop */ }
		}

		_toStagePoint(clientX, clientY) {
			const rect = this.stageContainer.getBoundingClientRect();
			const pt = { x: clientX - rect.left, y: clientY - rect.top };
			const transform = this.stage.getAbsoluteTransform().copy().invert();
			return transform.point(pt);
		}

		addSeat(seatData, position, opts) {
			if (!this.stage || !this.layer) return null;
			const recordId = String(seatData.recordId || seatData.id || Date.now());
			if (this.seatIdToNode.has(recordId)) {
				return this.seatIdToNode.get(recordId);
			}
			const width = this.fixedSeatSize;
			const height = this.fixedSeatSize; // 常に正方形固定
			const step = this.snapStep || 10;
			const x = Math.round((((position && position.x) || 20) / step)) * step;
			const y = Math.round((((position && position.y) || 20) / step)) * step;
			const node = this._createSeatNode({
				recordId,
				seatNumber: seatData.seatNumber || '',
				extNumber: seatData.extNumber || '',
				pcNumber: seatData.pcNumber || '',
				deptName: seatData.deptName || '',
				x, y, width, height
			});
			this.layer.add(node);
			this.seatIdToNode.set(recordId, node);
			const markPending = !opts || opts.markPending !== false;
			if (markPending) {
				this.pendingChanges.set(recordId, { x, y, width, height, display: true });
			}
			this.layer.batchDraw();
			return node;
		}

		async _loadLeftSeatList(siteFloor) {
			try {
				const { site, floor } = this._parseSiteFloor(siteFloor);
				const query = this._buildSeatListQuery(site, floor);
				const appId = CONFIG.getAppIdByLedgerName('座席台帳') || 8;
				const records = await window.searchEngine.searchRecordsWithQuery(String(appId), query);
				this._renderSeatList(records || []);
			} catch (e) {
				console.error('左リスト読み込みエラー', e);
				this._renderSeatList([]);
			}
		}

		_parseSiteFloor(siteFloor) {
			if (siteFloor && typeof siteFloor === 'object') {
				return { site: siteFloor.site || '', floor: siteFloor.floor || null };
			}
			const text = String(siteFloor || '').trim();
			const m = text.match(/^(.+?)(\d{2})F$/);
			if (m) {
				return { site: m[1], floor: parseInt(m[2].replace(/^0+/, ''), 10) };
			}
			return { site: text, floor: null };
		}

		_parseSiteFloorToken(token) {
			const t = String(token || '').trim();
			if (!t) return { site: '', floor: null };
			const m = t.match(/^(.+?)(\d{2})F$/);
			if (!m) return { site: '', floor: null };
			const site = m[1];
			const floor = parseInt(m[2].replace(/^0+/, ''), 10);
			return { site, floor };
		}

		_buildSeatListQuery(site, floorNumber) {
			const parts = [];
			// 未配置（座席表表示がtrueではない = false/未設定）
			parts.push('(座席表表示 not in ("true"))');
			if (site && site.trim() !== '') {
				parts.push(`座席拠点 in ("${site}")`);
			}
			if (Number.isFinite(floorNumber)) {
				// 階が数値フィールドである想定
				parts.push(`階 = ${floorNumber}`);
			}
			const where = parts.join(' and ');
			return where + ' order by 座席番号 asc';
		}

		async _initSiteOptions() {
			try {
				const appId = CONFIG.getAppIdByLedgerName('座席台帳') || 8;
				const fields = await window.fieldInfoAPI.getAppFields(String(appId));
				const siteField = fields.find(f => f.code === '座席拠点');
				if (!siteField || !Array.isArray(siteField.options)) return;
				if (!this.siteSelectEl) return;
				this.siteSelectEl.innerHTML = '';
				const empty = document.createElement('option');
				empty.value = '';
				empty.textContent = '拠点(未選択)';
				this.siteSelectEl.appendChild(empty);
				siteField.options.forEach(opt => {
					const o = document.createElement('option');
					o.value = opt;
					o.textContent = opt;
					this.siteSelectEl.appendChild(o);
				});
			} catch (_) { /* noop */ }
		}

		_renderSeatList(records) {
			if (!this.leftListEl) return;
			// クリア
			while (this.leftListEl.firstChild) this.leftListEl.removeChild(this.leftListEl.firstChild);
			if (!records || records.length === 0) {
				const empty = document.createElement('div');
				empty.className = 'seatlist-empty';
				empty.textContent = '未配置の座席がありません';
				this.leftListEl.appendChild(empty);
				return;
			}
			// 座席番号の昇順（数値も自然順）で並べ替え
			records.sort((a, b) => {
				const sa = getVal(a['座席番号']) || '';
				const sb = getVal(b['座席番号']) || '';
				return String(sa).localeCompare(String(sb), 'ja', { numeric: true, sensitivity: 'base' });
			});
			records.forEach(rec => {
				const seatNumber = getVal(rec['座席番号']);
				const dept = getVal(rec['座席部署']);
				const ik = getVal(rec[CONFIG.integrationKey]);
				let pc = '', ext = '';
				try {
					const parsed = window.dataIntegrator ? new window.DataIntegrator().parseIntegrationKey(ik) : { PC: '', EXT: '' };
					pc = parsed.PC || '';
					ext = parsed.EXT || '';
				} catch (_) { /* noop */ }
				const item = document.createElement('div');
				item.className = 'seat-item';
				item.draggable = true;
				const recordId = getVal(rec['$id']);
				const payload = { recordId, seatNumber, extNumber: ext, pcNumber: pc, deptName: dept };
				item.setAttribute('data-seat', JSON.stringify(payload));
				item.setAttribute('data-seat-id', String(recordId || ''));
				item.textContent = dept ? `${seatNumber}（${dept}）` : `${seatNumber}`;
				item.setAttribute('data-seat-number', seatNumber || '');
				item.setAttribute('data-seat-dept', dept || '');
				this.leftListEl.appendChild(item);
			});
			this._applyListFilter();
			function getVal(field) { return field && field.value !== undefined ? field.value : (field || ''); }
		}

		async _loadMapSeats(site, floorNumber) {
			try {
				const appId = CONFIG.getAppIdByLedgerName('座席台帳') || 8;
				const parts = [];
				// 配置済み（trueのみ）
				parts.push('座席表表示 in ("true")');
				if (site && site.trim() !== '') parts.push(`座席拠点 in ("${site}")`);
				if (Number.isFinite(floorNumber)) parts.push(`階 = ${floorNumber}`);
				const query = parts.join(' and ');
				const records = await window.searchEngine.searchRecordsWithQuery(String(appId), query);
				(records || []).forEach(rec => {
					const get = (f) => (f && f.value !== undefined) ? f.value : (f || '');
					const recordId = get(rec['$id']);
					const x = Number(get(rec['座標X'])) || 20;
					const y = Number(get(rec['座標Y'])) || 20;
					const w = Number(get(rec['幅'])) || 150;
					const h = Number(get(rec['高さ'])) || w; // デフォルトは正方形
					const seatNumber = get(rec['座席番号']);
					const dept = get(rec['座席部署']);
					const ik = get(rec[CONFIG.integrationKey]);
					let pc = '', ext = '';
					try { const p = new window.DataIntegrator().parseIntegrationKey(ik); pc = p.PC || ''; ext = p.EXT || ''; } catch(_) {}
					this.addSeat({ recordId, seatNumber, pcNumber: pc, extNumber: ext, deptName: dept, width: w, height: h }, { x, y }, { markPending: false });
				});
				this.layer && this.layer.batchDraw();
			} catch (e) {
				console.error('MAP座席読み込みエラー', e);
			}
		}

		_applyListFilter() {
			if (!this.leftListEl) return;
			const q = (this.filterInputEl && this.filterInputEl.value || '').trim();
			const tokens = q.split(/[\s,、]+/).map(s => s.trim()).filter(Boolean);
			const items = this.leftListEl.querySelectorAll('.seat-item');
			items.forEach(el => {
				if (tokens.length === 0) { el.style.display = ''; return; }
				const seat = (el.getAttribute('data-seat-number') || '').toLowerCase();
				const dept = (el.getAttribute('data-seat-dept') || '').toLowerCase();
				const hit = tokens.every(t => seat.toLowerCase().includes(t.toLowerCase()) || dept.toLowerCase().includes(t.toLowerCase()));
				el.style.display = hit ? '' : 'none';
			});
		}

		_enterPanZoom() {
			if (!this.stage) return;
			const stage = this.stage;
			let scaleBy = 1.05;
			stage.on('wheel', (e) => {
				evtPrevent(e);
				const oldScale = stage.scaleX();
				const pointer = stage.getPointerPosition();
				const mousePointTo = {
					x: (pointer.x - stage.x()) / oldScale,
					y: (pointer.y - stage.y()) / oldScale
				};
				const direction = e.evt.deltaY > 0 ? 1 : -1;
				const newScale = direction > 0 ? oldScale / scaleBy : oldScale * scaleBy;
				stage.scale({ x: newScale, y: newScale });
				const newPos = {
					x: pointer.x - mousePointTo.x * newScale,
					y: pointer.y - mousePointTo.y * newScale
				};
				stage.position(newPos);
				stage.batchDraw();
			});
			// ドラッグでパン
			stage.draggable(true);
		}

		highlightTexts(query) {
			try {
				const q = String(query || '').trim();
				const tokens = q.split(/[\s,、]+/).map(s => s.trim()).filter(Boolean);
				// 既存のハイライトを全解除
				this.seatIdToNode.forEach(group => {
					const texts = group.find('Text');
					const bgs = group.find('.row-bg');
					for (let i = 0; i < texts.length; i++) {
						const t = texts[i];
						const isHit = tokens.length > 0 && tokens.some(tok => (t.text() || '').includes(tok));
						if (isHit) {
							t.fill('#d32f2f');
							t.fontStyle('700');
							if (bgs[i]) bgs[i].visible(true);
						} else {
							t.fill('#111');
							t.fontStyle('normal');
							if (bgs[i]) bgs[i].visible(false);
						}
					}
				});
				this.layer && this.layer.batchDraw();
			} catch (_) { /* noop */ }
		}

		_ensureStage() {
			if (!this.stageContainer) return;
			if (!window.Konva || !window.Konva.Stage) {
				alert('Konva.js が読み込まれていません。vendorにkonva.min.jsを配置してください。');
				return;
			}
			if (this.stage) return;
			const rect = this.stageContainer.getBoundingClientRect();
			const width = Math.max(400, Math.floor(rect.width) || 800);
			const height = Math.max(300, Math.floor(window.innerHeight - 220));
			this.stage = new Konva.Stage({ container: this.stageContainer, width, height });
			this.layer = new Konva.Layer();
			this.hudLayer = new Konva.Layer({ listening: false });
			this.stage.add(this.layer);
			this.stage.add(this.hudLayer);
			// 共通トランスフォーマ
			this.transformer = new Konva.Transformer({
				enabledAnchors: [],
				rotateEnabled: false,
				ignoreStroke: true
			});
			this.layer.add(this.transformer);
			this._enterPanZoom();
			// overlay not used
		}

		_createSeatNode(meta) {
			const group = new Konva.Group({ x: meta.x, y: meta.y, draggable: this.isEditing, name: 'seat-node', id: `seat-${meta.recordId}` });
			group.setAttr('recordId', meta.recordId);
			const rect = new Konva.Rect({ width: meta.width, height: meta.height, cornerRadius: 0, stroke: '#333', strokeWidth: 2, fill: '#fff' });
			group.add(rect);
			// 行ハイライト用の背景（テキストの背面・区切り線の背面）
			const rowH = meta.height / 6;
			for (let i = 0; i < 6; i++) {
				group.add(new Konva.Rect({ name: 'row-bg', x: 0, y: i * rowH, width: meta.width, height: rowH, fill: '#fff59d', opacity: 0.7, visible: false, listening: false }));
			}
			// 内部水平線（1/6〜5/6）で6行分割
			[1,2,3,4,5].map(i => rowH * i).forEach(y => {
				group.add(new Konva.Line({ points: [0, y, meta.width, y], stroke: '#888', strokeWidth: 1 }));
			});
			// テキスト（中央寄せ）: 1:座席番号 2:内線番号 3:PC番号 4:部署 5:空 6:空
			const textOpts = { align: 'center', verticalAlign: 'middle', fontSize: 12, fill: '#111' };
			const t1 = new Konva.Text({ ...textOpts, x: 0, y: 0 * rowH, width: meta.width, height: rowH, text: meta.seatNumber || '' });
			const t2 = new Konva.Text({ ...textOpts, x: 0, y: 1 * rowH, width: meta.width, height: rowH, text: meta.extNumber || '' });
			const t3 = new Konva.Text({ ...textOpts, x: 0, y: 2 * rowH, width: meta.width, height: rowH, text: meta.pcNumber || '' });
			const t4 = new Konva.Text({ ...textOpts, x: 0, y: 3 * rowH, width: meta.width, height: rowH, text: meta.deptName || '' });
			const t5 = new Konva.Text({ ...textOpts, x: 0, y: 4 * rowH, width: meta.width, height: rowH, text: '' });
			const t6 = new Konva.Text({ ...textOpts, x: 0, y: 5 * rowH, width: meta.width, height: rowH, text: '' });
			group.add(t1); group.add(t2); group.add(t3); group.add(t4); group.add(t5); group.add(t6);

			// 選択
			group.on('click', () => {
				if (!this.isEditing) return;
				this.transformer.nodes([group]);
				this._showSizeLabel(group);
				this.layer.draw();
			});
			// ドラッグ/リサイズ後にメタ更新
			group.on('dragmove', () => { this._applySnap(group); this._updateSizeLabel(group); });
			group.on('dragend', () => { this._applySnap(group); this._syncSeatMeta(group); this._updateSizeLabel(group); });
			group.on('transform', () => { this._updateSizeLabel(group); });
			group.on('transformend', () => { this._syncSeatMeta(group); this._updateSizeLabel(group); });
			this.transformer.on('transform', () => { const nodes = this.transformer.nodes(); nodes && nodes.forEach(n => this._updateSizeLabel(n)); });
			this.transformer.on('transformend', () => { const nodes = this.transformer.nodes(); nodes && nodes.forEach(n => { this._syncSeatMeta(n); this._updateSizeLabel(n); }); });

			// enable dblclick copy & search highlighting
			group.find('Text').forEach(textNode => {
				textNode.on('dblclick', () => {
					const txt = textNode.text() || '';
					if (!txt) return;
					navigator.clipboard && navigator.clipboard.writeText(txt).then(() => {
						try { showCopyToast('コピーしました'); } catch(_) {}
					});
				});
			});
			return group;
		}

		_applySnap(group) {
			try {
				if (!this.snapEnabled) return;
				const g = this.snapStep || this.fixedSeatSize;
				const pos = group.position();
				const nx = Math.round(pos.x / g) * g;
				const ny = Math.round(pos.y / g) * g;
				group.position({ x: nx, y: ny });
			} catch (_) { /* noop */ }
		}

		_showSizeLabel(group) {
			try {
				if (!this.hudLayer) return;
				const id = String(group.getAttr('recordId'));
				let label = this.sizeLabelById.get(id);
				if (!label) {
					label = new Konva.Label({ opacity: 0.95 });
					label.add(new Konva.Tag({ fill: 'rgba(0,0,0,0.65)', cornerRadius: 3 }));
					label.add(new Konva.Text({ text: '', fill: '#fff', fontSize: 12, padding: 4 }));
					this.hudLayer.add(label);
					this.sizeLabelById.set(id, label);
				}
				label.visible(true);
				this._updateSizeLabel(group);
				this.hudLayer.batchDraw();
			} catch (_) { /* noop */ }
		}

		_updateSizeLabel(group) {
			try {
				if (!this.hudLayer) return;
				const id = String(group.getAttr('recordId'));
				const label = this.sizeLabelById.get(id);
				if (!label) return;
				const rect = group.findOne('Rect');
				const scaleX = group.scaleX() || 1;
				const scaleY = group.scaleY() || 1;
				const w = Math.max(1, Math.round(rect.width() * scaleX));
				const h = Math.max(1, Math.round(rect.height() * scaleY));
				// ラベルテキスト
				const text = label.findOne('Text');
				text.text(`${w}px × ${h}px`);
				// ラベル位置（座席の右上少し外）
				const bbox = group.getClientRect({ relativeTo: this.layer });
				label.position({ x: bbox.x + bbox.width + 6, y: bbox.y - 6 });
				label.zIndex(this.hudLayer.getChildren().length - 1);
				this.hudLayer.batchDraw();
			} catch (_) { /* noop */ }
		}

		_hideAllSizeLabels() {
			try {
				if (!this.sizeLabelById) return;
				this.sizeLabelById.forEach(l => { try { l.visible(false); } catch(_){} });
				this.hudLayer && this.hudLayer.batchDraw();
			} catch (_) { /* noop */ }
		}

		_clearMap() {
			try {
				if (this.transformer) {
					try { this.transformer.nodes([]); } catch (_) { /* noop */ }
				}
				// Konvaノードを破棄
				if (this.seatIdToNode) {
					this.seatIdToNode.forEach(node => { try { node.destroy(); } catch(_) {} });
					this.seatIdToNode.clear();
				}
				if (this.layer) this.layer.batchDraw();
			} catch (_) { /* noop */ }
		}

		_syncSeatMeta(group) {
			try {
				const id = String(group.getAttr('recordId'));
				const rect = group.findOne('Rect');
				// スケールを実寸に反映
				const scaleX = group.scaleX() || 1;
				const scaleY = group.scaleY() || 1;
				const width = Math.max(10, Math.round(rect.width() * scaleX));
				const height = Math.max(10, Math.round(rect.height() * scaleY));
				group.scale({ x: 1, y: 1 });
				rect.width(width); rect.height(height);
				// 内部線とテキストも更新（6行対応）
				const lines = group.find('Line');
				const rowH = height / 6;
				if (lines && lines.length >= 5) {
					[1,2,3,4,5].forEach((i, idx) => {
						const y = rowH * i;
						lines[idx].points([0, y, width, y]);
					});
				}
				// 背景矩形の位置/サイズも更新
				const bgs = group.find('.row-bg');
				if (bgs && bgs.length >= 6) {
					for (let i = 0; i < 6; i++) {
						bgs[i].setAttrs({ x: 0, y: i * rowH, width, height: rowH });
					}
				}
				const texts = group.find('Text');
				if (texts && texts.length >= 6) {
					for (let i = 0; i < 6; i++) {
						texts[i].setAttrs({ x: 0, y: i * rowH, width, height: rowH });
					}
				}
				const step = this.snapStep || 10;
				const pos = group.position();
				const sx = Math.round(pos.x / step) * step;
				const sy = Math.round(pos.y / step) * step;
				group.position({ x: sx, y: sy });
				this.pendingChanges.set(id, { x: sx, y: sy, width, height, display: true });
				this.layer.batchDraw();
			} catch (_) { /* noop */ }
		}

		// ===== APIスケルトン =====
		enterEditMode() {
			this.isEditing = true;
			this._showGrid();
			this.seatIdToNode.forEach(node => node.draggable(true));
		}
		exitEditMode() {
			this.isEditing = false;
			this.transformer.nodes([]);
			this._hideGrid();
			this._hideAllSizeLabels();
			this.seatIdToNode.forEach(node => node.draggable(false));
		}
		// 自動整列機能は削除
		saveChanges() {
			try {
				if (!this.pendingChanges || this.pendingChanges.size === 0) {
					alert('変更はありません');
					return;
				}
				this._showLoading('保存中...');
				const appId = CONFIG.getAppIdByLedgerName('座席台帳') || 8;
				const updates = [];
				this.pendingChanges.forEach((meta, recordId) => {
					const rec = {
						id: String(recordId),
						record: {
							'座標X': { value: Number(meta.x) },
							'座標Y': { value: Number(meta.y) },
							'幅':   { value: Number(meta.width) },
							'高さ': { value: Number(meta.height) },
							'座席表表示': { value: (meta.display === false ? 'false' : 'true') }
						}
					};
					updates.push(rec);
				});

				const chunks = [];
				const size = 100;
				for (let i = 0; i < updates.length; i += size) chunks.push(updates.slice(i, i + size));

				const run = async () => {
					for (const chunk of chunks) {
						await kintone.api(kintone.api.url('/k/v1/records', true), 'PUT', { app: String(appId), records: chunk });
					}
				};

				run().then(async () => {
					// 保存成功: ペンディングをクリア
					this.pendingChanges.clear();
					// 再読み込み（現在の拠点/階で）
					const token = this.siteSelectEl ? this.siteSelectEl.value : '';
					const parsed = this._parseSiteFloorToken(token);
					await this.loadAndRender(parsed);
					this._hideLoading();
				}).catch(err => {
					console.error('保存エラー', err);
					alert('保存に失敗しました: ' + (err && err.message ? err.message : 'unknown'));
					this._hideLoading();
				});
			} catch (e) {
				console.error('保存例外', e);
				alert('保存処理中にエラーが発生しました');
				this._hideLoading();
			}
		}
		zoomIn() {
			if (!this.stage) return;
			this.stage.scale({ x: this.stage.scaleX() * 1.1, y: this.stage.scaleY() * 1.1 });
			if (this.isEditing) this._updateGrid();
			this.stage.batchDraw();
		}
		zoomOut() {
			if (!this.stage) return;
			this.stage.scale({ x: this.stage.scaleX() / 1.1, y: this.stage.scaleY() / 1.1 });
			if (this.isEditing) this._updateGrid();
			this.stage.batchDraw();
		}

		_showGrid() {
			try {
				if (!this.stage) return;
				if (!this.gridLayer) {
					this.gridLayer = new Konva.Layer({ listening: false });
					this.stage.add(this.gridLayer);
				}
				this.gridLayer.visible(true);
				this._updateGrid();
				// パン/ズームで更新
				if (!this._gridEventsBound) {
					this._onStageWheelForGrid = () => { if (this.isEditing) this._updateGrid(); };
					this._onStageDragForGrid = () => { if (this.isEditing) this._updateGrid(); };
					this.stage.on('wheel', this._onStageWheelForGrid);
					this.stage.on('dragmove', this._onStageDragForGrid);
					this.stage.on('dragend', this._onStageDragForGrid);
					this._gridEventsBound = true;
				}
			} catch (_) { /* noop */ }
		}

		_hideGrid() {
			try {
				if (this.gridLayer) { this.gridLayer.visible(false); this.stage.batchDraw(); }
				if (this._gridEventsBound && this.stage) {
					if (this._onStageWheelForGrid) this.stage.off('wheel', this._onStageWheelForGrid);
					if (this._onStageDragForGrid) { this.stage.off('dragmove', this._onStageDragForGrid); this.stage.off('dragend', this._onStageDragForGrid); }
					this._gridEventsBound = false;
				}
			} catch (_) { /* noop */ }
		}

		_updateGrid() {
			try {
				if (!this.stage || !this.gridLayer) return;
				const stage = this.stage;
				const scale = stage.scaleX() || 1;
				const stepWorld = (this.gridSize || 20) / scale;
				const inv = stage.getAbsoluteTransform().copy().invert();
				const tl = inv.point({ x: 0, y: 0 });
				const br = inv.point({ x: stage.width(), y: stage.height() });
				const startX = Math.floor(tl.x / stepWorld) * stepWorld;
				const endX = Math.ceil(br.x / stepWorld) * stepWorld;
				const startY = Math.floor(tl.y / stepWorld) * stepWorld;
				const endY = Math.ceil(br.y / stepWorld) * stepWorld;
				this.gridLayer.destroyChildren();
				for (let x = startX; x <= endX; x += stepWorld) {
					this.gridLayer.add(new Konva.Line({ points: [x, startY, x, endY], stroke: '#e0e0e0', strokeWidth: 1 }));
				}
				for (let y = startY; y <= endY; y += stepWorld) {
					this.gridLayer.add(new Konva.Line({ points: [startX, y, endX, y], stroke: '#e0e0e0', strokeWidth: 1 }));
				}
				this.gridLayer.moveToBottom();
				stage.batchDraw();
			} catch (_) { /* noop */ }
		}
		resetView() {
			if (!this.stage) return;
			// コンテンツの左上が見えるように整列（1.0表示に戻す）
			this._alignViewTopLeft(1);
			if (this.isEditing) this._updateGrid();
			this._hideAllSizeLabels();
			this.stage.batchDraw();
		}

		_alignViewTopLeft(scale) {
			try {
				if (!this.stage) return;
				const nodes = Array.from(this.seatIdToNode.values());
				const s = (typeof scale === 'number' && scale > 0) ? scale : 1;
				if (!nodes.length) { this.stage.position({ x: 0, y: 0 }); this.stage.scale({ x: s, y: s }); return; }
				let minX = Infinity, minY = Infinity;
				nodes.forEach(n => { const p = n.position(); if (p.x < minX) minX = p.x; if (p.y < minY) minY = p.y; });
				const margin = 20;
				this.stage.scale({ x: s, y: s });
				this.stage.position({ x: margin - minX * s, y: margin - minY * s });
				this.stage.batchDraw();
			} catch (_) { /* noop */ }
		}
		destroy() {
			try {
				if (this.stage) { this.stage.destroy(); }
			} catch (e) { /* noop */ }
			this.stage = null;
			this.layer = null;
			this.initialized = false;
		}
	}

	function evtPrevent(e){ try{ e.evt && e.evt.preventDefault && e.evt.preventDefault(); } catch(_){} }

	// グローバル公開
	window.SeatMap = SeatMap;
})();


