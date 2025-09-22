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
			this.propsPanelEl = null;
			this.lineWidthInputEl = null;
			this.lineColorSelectEl = null; // legacy (not used)
			this.lineColorBtnEl = null;
			this.lineColorPaletteEl = null;
			this._onDocClickPalette = null;
			this.textBgColorBtnEl = null;
			this.fontSizeInputEl = null;
			this.fontBoldCheckboxEl = null;
			this.fontFamilySelectEl = null;
			this._paletteApplyTarget = null; // 'color' | 'textBg'
			this.textAlignButtons = [];
			this.textVAlignButtons = [];
			this._selectedShapeGroup = null;
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
			// プロパティパネル
			const props = document.createElement('div');
			props.className = 'seatmap-props-panel';
			props.style.display = 'none';
			props.innerHTML = `
				<div class="props-inner">
					<div class="row">
					<label>線太さ</label>
						<input type="number" class="prop-line-width" min="1" max="20" value="3" />
					</div>
					<div class="row">
						<label>線の色</label>
						<select class="prop-line-color">
							<option value="#1E88E5">青</option>
							<option value="#E53935">赤</option>
							<option value="#43A047">緑</option>
							<option value="#FB8C00">オレンジ</option>
							<option value="#6D4C41">ブラウン</option>
							<option value="#000000">黒</option>
							<option value="#9E9E9E">グレー</option>
						</select>
					</div>
				</div>`;
			stageWrap.appendChild(props);
			right.appendChild(stageWrap);
			layout.appendChild(right);
			this.stageContainer = stageDiv;
			this.propsPanelEl = props;

			root.appendChild(layout);
			this.container = root;
			// 拠点選択肢（静的）初期化は不要
			return root;
		}

		_buildControls() {
			const wrap = document.createElement('div');
			wrap.className = 'seatmap-controls-inner';
			this.controlsRootEl = wrap;
			const row1 = document.createElement('div'); row1.className = 'seatmap-controls-row';
			const row2 = document.createElement('div'); row2.className = 'seatmap-controls-row seatmap-edit-group';
			row2.classList.add('edit-only');
			this.row2El = row2;

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
			searchInput.placeholder = '文字列検索（座席/内線/PC/部署） 複数可: スペース/カンマ/タブ/改行';
			searchInput.className = 'seatmap-select search-multi';
			const searchBtn = document.createElement('button');
			searchBtn.className = 'seatmap-btn primary';
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
			editToggle.className = 'seatmap-btn danger';
			editToggle.textContent = '編集OFF';
			editToggle.addEventListener('click', () => {
				const editing = editToggle.getAttribute('data-editing') === 'true';
				// 拠点+階 未選択時は編集ON不可
				try {
					const token = this.siteSelectEl ? String(this.siteSelectEl.value || '') : '';
					if (!editing) { // これからONにする
						if (!token || !/^.+\d{2}F$/.test(token)) {
							alert('拠点＋階を選択してください');
							return;
						}
					}
				} catch(_) { /* noop */ }
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

			// === 上部メニュー: 線プロパティ（選択時のみ使用可） ===
			const lineWidthLabel = document.createElement('span');
			lineWidthLabel.textContent = '線太さ:';
			lineWidthLabel.style.marginLeft = '8px';
			lineWidthLabel.style.marginRight = '4px';
			const lineWidth = document.createElement('input');
			lineWidth.type = 'number';
			lineWidth.min = '1';
			lineWidth.max = '60';
			lineWidth.value = '3';
			lineWidth.disabled = true;
			lineWidth.title = '線太さ（選択時のみ）';
			lineWidth.className = 'seatmap-select';
			this.lineWidthInputEl = lineWidth;
			lineWidth.addEventListener('input', () => this._applyLineWidthFromControls());

			// カラーパレット（12x12）トリガーボタン（線/テキスト色）
			const colorBtn = document.createElement('button');
			colorBtn.className = 'seatmap-btn';
			colorBtn.textContent = '線・文字色…';
			colorBtn.disabled = true;
			colorBtn.title = '文字色/線色（選択時のみ）';
			this.lineColorBtnEl = colorBtn;
			colorBtn.addEventListener('click', (ev) => { this._paletteApplyTarget = 'color'; this._toggleColorPalette(ev); });

			// テキスト背景色ボタン
			const textBgColorBtn = document.createElement('button');
			textBgColorBtn.className = 'seatmap-btn';
			textBgColorBtn.textContent = '背景色…';
			textBgColorBtn.disabled = true;
			textBgColorBtn.title = '背景色（テキスト/図形 選択時のみ）';
			this.textBgColorBtnEl = textBgColorBtn;
			textBgColorBtn.addEventListener('click', (ev) => { this._paletteApplyTarget = 'textBg'; this._toggleColorPalette(ev); });

			// === テキスト専用: 文字サイズ・太字・フォントファミリ ===
			const fontSizeLabel = document.createElement('span');
			fontSizeLabel.textContent = '文字サイズ:';
			fontSizeLabel.style.marginLeft = '8px';
			fontSizeLabel.style.marginRight = '4px';
			const fontSizeInput = document.createElement('input');
			fontSizeInput.type = 'number';
			fontSizeInput.min = '8';
			fontSizeInput.max = '72';
			fontSizeInput.value = '14';
			fontSizeInput.disabled = true;
			fontSizeInput.className = 'seatmap-select';
			this.fontSizeInputEl = fontSizeInput;
			fontSizeInput.addEventListener('input', () => this._applyTextFontSizeFromControls());

			const fontBoldLabel = document.createElement('span');
			fontBoldLabel.textContent = '太字:';
			fontBoldLabel.style.marginLeft = '8px';
			fontBoldLabel.style.marginRight = '4px';
			const fontBold = document.createElement('input');
			fontBold.type = 'checkbox';
			fontBold.disabled = true;
			this.fontBoldCheckboxEl = fontBold;
			fontBold.addEventListener('change', () => this._applyTextBoldFromControls());

			const fontFamilyLabel = document.createElement('span');
			fontFamilyLabel.textContent = 'フォント:';
			fontFamilyLabel.style.marginLeft = '8px';
			fontFamilyLabel.style.marginRight = '4px';
            const fontFamily = document.createElement('select');
            fontFamily.className = 'seatmap-select';
            fontFamily.disabled = true;
            const fontOptions = [
                { label: 'System UI', value: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, Helvetica, sans-serif' },
                // 日本語 Sans-Serif（ゴシック体）
                { label: 'Noto Sans JP', value: '"Noto Sans JP", "Hiragino Kaku Gothic ProN", Meiryo, "Yu Gothic", "Segoe UI", Arial, Helvetica, sans-serif' },
                { label: 'Meiryo (メイリオ)', value: 'Meiryo, "Yu Gothic", "Noto Sans JP", "Hiragino Kaku Gothic ProN", Arial, Helvetica, sans-serif' },
                { label: 'Yu Gothic (游ゴシック)', value: '"Yu Gothic", Meiryo, "Noto Sans JP", "Hiragino Kaku Gothic ProN", Arial, Helvetica, sans-serif' },
                { label: 'Hiragino Kaku Gothic ProN', value: '"Hiragino Kaku Gothic ProN", "Hiragino Sans", "Noto Sans JP", "Yu Gothic", Meiryo, Arial, Helvetica, sans-serif' },
                { label: 'Hiragino Sans', value: '"Hiragino Sans", "Hiragino Kaku Gothic ProN", "Noto Sans JP", "Yu Gothic", Meiryo, Arial, Helvetica, sans-serif' },
                { label: 'MS PGothic', value: '"MS PGothic", "MS Gothic", Meiryo, "Yu Gothic", "Noto Sans JP", Arial, Helvetica, sans-serif' },
                // 日本語 Serif（明朝）
                { label: 'Noto Serif JP', value: '"Noto Serif JP", "Yu Mincho", "Hiragino Mincho ProN", "MS Mincho", serif' },
                { label: 'Yu Mincho (游明朝)', value: '"Yu Mincho", "Noto Serif JP", "Hiragino Mincho ProN", "MS Mincho", serif' },
                { label: 'Hiragino Mincho ProN', value: '"Hiragino Mincho ProN", "Yu Mincho", "Noto Serif JP", "MS Mincho", serif' },
                { label: 'MS Mincho', value: '"MS Mincho", "MS PMincho", "Yu Mincho", "Noto Serif JP", serif' },
                // 欧文 Sans-Serif
                { label: 'Roboto', value: 'Roboto, Arial, Helvetica, sans-serif' },
                { label: 'Inter', value: 'Inter, Arial, Helvetica, sans-serif' },
                { label: 'Open Sans', value: '"Open Sans", Arial, Helvetica, sans-serif' },
                // 欧文 Serif
                { label: 'Times New Roman', value: '"Times New Roman", Times, serif' },
                { label: 'Georgia', value: 'Georgia, "Times New Roman", serif' },
                // 等幅
                { label: 'Consolas (等幅)', value: 'Consolas, "Courier New", monospace' },
                { label: 'Source Code Pro (等幅)', value: '"Source Code Pro", "Courier New", monospace' },
                { label: 'Fira Code (等幅)', value: '"Fira Code", "Courier New", monospace' }
            ];
            fontOptions.forEach(optDef => { const opt = document.createElement('option'); opt.value = optDef.value; opt.textContent = optDef.label; fontFamily.appendChild(opt); });
			this.fontFamilySelectEl = fontFamily;
			fontFamily.addEventListener('change', () => this._applyTextFontFamilyFromControls());

			// テキスト: 横/縦揃えコントロール
			const alignHLabel = document.createElement('span');
			alignHLabel.textContent = '横揃え:';
			alignHLabel.style.marginLeft = '8px';
			alignHLabel.style.marginRight = '4px';
			const alignLeftBtn = document.createElement('button');
			alignLeftBtn.className = 'seatmap-btn';
			alignLeftBtn.textContent = '左';
			alignLeftBtn.disabled = true;
			alignLeftBtn.title = '左よせ';
			alignLeftBtn.classList.add('toggle');
			alignLeftBtn.dataset.align = 'left';
			alignLeftBtn.addEventListener('click', () => this._applyTextAlignFromControls('left'));
			const alignCenterBtn = document.createElement('button');
			alignCenterBtn.className = 'seatmap-btn';
			alignCenterBtn.textContent = '中';
			alignCenterBtn.disabled = true;
			alignCenterBtn.title = '中央よせ';
			alignCenterBtn.classList.add('toggle');
			alignCenterBtn.dataset.align = 'center';
			alignCenterBtn.addEventListener('click', () => this._applyTextAlignFromControls('center'));
			const alignRightBtn = document.createElement('button');
			alignRightBtn.className = 'seatmap-btn';
			alignRightBtn.textContent = '右';
			alignRightBtn.disabled = true;
			alignRightBtn.title = '右よせ';
			alignRightBtn.classList.add('toggle');
			alignRightBtn.dataset.align = 'right';
			alignRightBtn.addEventListener('click', () => this._applyTextAlignFromControls('right'));
			this.textAlignButtons = [alignLeftBtn, alignCenterBtn, alignRightBtn];

			const alignVLabel = document.createElement('span');
			alignVLabel.textContent = '縦揃え:';
			alignVLabel.style.marginLeft = '8px';
			alignVLabel.style.marginRight = '4px';
			const alignTopBtn = document.createElement('button');
			alignTopBtn.className = 'seatmap-btn';
			alignTopBtn.textContent = '上';
			alignTopBtn.disabled = true;
			alignTopBtn.title = '上よせ';
			alignTopBtn.classList.add('toggle');
			alignTopBtn.dataset.valign = 'top';
			alignTopBtn.addEventListener('click', () => this._applyTextVerticalAlignFromControls('top'));
			const alignMiddleBtn = document.createElement('button');
			alignMiddleBtn.className = 'seatmap-btn';
			alignMiddleBtn.textContent = '中';
			alignMiddleBtn.disabled = true;
			alignMiddleBtn.title = '中央寄せ';
			alignMiddleBtn.classList.add('toggle');
			alignMiddleBtn.dataset.valign = 'middle';
			alignMiddleBtn.addEventListener('click', () => this._applyTextVerticalAlignFromControls('middle'));
			const alignBottomBtn = document.createElement('button');
			alignBottomBtn.className = 'seatmap-btn';
			alignBottomBtn.textContent = '下';
			alignBottomBtn.disabled = true;
			alignBottomBtn.title = '下よせ';
			alignBottomBtn.classList.add('toggle');
			alignBottomBtn.dataset.valign = 'bottom';
			alignBottomBtn.addEventListener('click', () => this._applyTextVerticalAlignFromControls('bottom'));
			this.textVAlignButtons = [alignTopBtn, alignMiddleBtn, alignBottomBtn];

			// 選択座席の削除（編集モード時のみ有効）
			const deleteBtn = document.createElement('button');
			deleteBtn.className = 'seatmap-btn';
			deleteBtn.textContent = '削除';
			deleteBtn.addEventListener('click', () => this.deleteSelectedSeats());
			deleteBtn.disabled = true; // 初期は編集OFFのため無効
			this.deleteButtonEl = deleteBtn;

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

			// --- パーツ追加（保存）: まずは保存を優先。表示は後続で実装 ---
			const addShapeBtn = document.createElement('button');
			addShapeBtn.className = 'seatmap-btn';
			addShapeBtn.textContent = '＋図形';
			addShapeBtn.title = '図形（矩形）のパーツを保存します';
			addShapeBtn.addEventListener('click', () => this.createPartRecord('図形'));

			const addTextBtn = document.createElement('button');
			addTextBtn.className = 'seatmap-btn';
			addTextBtn.textContent = '＋テキスト';
			addTextBtn.title = 'テキストのパーツを保存します';
			addTextBtn.addEventListener('click', () => this.createPartRecord('テキスト'));

			const addLineBtn = document.createElement('button');
			addLineBtn.className = 'seatmap-btn';
			addLineBtn.textContent = '＋線';
			addLineBtn.title = '線のパーツを保存します';
			addLineBtn.addEventListener('click', () => this.createPartRecord('線'));

			row1.appendChild(siteSelect);
			// floor入力は削除
			row1.appendChild(showBtn);
			row1.appendChild(searchInput);
			row1.appendChild(searchBtn);
			row1.appendChild(editToggle);
			// 以下は編集ONのときのみ表示
			deleteBtn.classList.add('edit-only');
			saveBtn.classList.add('edit-only');
			zoomOutBtn.classList.add('edit-only');
			zoomInBtn.classList.add('edit-only');
			resetBtn.classList.add('edit-only');
			row1.appendChild(deleteBtn);
			row1.appendChild(saveBtn);
			row1.appendChild(zoomOutBtn);
			row1.appendChild(zoomInBtn);
			row1.appendChild(resetBtn);

			// 図形パーツの追加操作を1段目の最後でグループ化
			const partGrp = document.createElement('div'); partGrp.className = 'seatmap-part-group';
			partGrp.classList.add('edit-only');
			const partTitle = document.createElement('span'); partTitle.className = 'seatmap-edit-group-title'; partTitle.textContent = 'パーツ追加';
			partGrp.appendChild(partTitle);
			partGrp.appendChild(addShapeBtn);
			partGrp.appendChild(addTextBtn);
			partGrp.appendChild(addLineBtn);
			row1.appendChild(partGrp);

			// 2行目: 編集系をグループ化
			const editTitle = document.createElement('span'); editTitle.className = 'seatmap-edit-group-title'; editTitle.textContent = '編集';
			row2.appendChild(editTitle);
			row2.appendChild(lineWidthLabel);
			row2.appendChild(lineWidth);
			row2.appendChild(colorBtn);
			row2.appendChild(textBgColorBtn);
			row2.appendChild(fontSizeLabel);
			row2.appendChild(fontSizeInput);
			row2.appendChild(fontBoldLabel);
			row2.appendChild(fontBold);
			row2.appendChild(fontFamilyLabel);
			row2.appendChild(fontFamily);
			// 横揃え
			row2.appendChild(alignHLabel);
			row2.appendChild(alignLeftBtn);
			row2.appendChild(alignCenterBtn);
			row2.appendChild(alignRightBtn);
			// 縦揃え
			row2.appendChild(alignVLabel);
			row2.appendChild(alignTopBtn);
			row2.appendChild(alignMiddleBtn);
			row2.appendChild(alignBottomBtn);

			wrap.appendChild(row1);
			wrap.appendChild(row2);
			// パーツ追加ボタンは上記グループに移動済み
			// 初期状態（編集OFF）では編集系を非表示
			this._updateEditControlsVisibility(false);
			return wrap;
		}

		_updateEditControlsVisibility(show) {
			try {
				const root = this.controlsRootEl || (this.container && this.container.querySelector('.seatmap-controls-inner'));
				if (!root) return;
				const targets = root.querySelectorAll('.edit-only');
				targets.forEach(el => { el.style.display = show ? '' : 'none'; });
			} catch(_) { /* noop */ }
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
					// パーツか座席かで分岐
					if (seat && (seat.objectType === '図形' || seat.objectType === 'テキスト' || seat.objectType === '線')) {
						let settings = null;
						try { settings = seat.partSettings ? JSON.parse(seat.partSettings) : null; } catch(_) { settings = null; }
						this.addPart({ recordId: seat.recordId, objectType: seat.objectType, settings: settings || {}, width: seat.width, height: seat.height }, stagePoint);
					} else {
						this.addSeat(seat, stagePoint);
					}
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

		addPart(partData, position, opts) {
			if (!this.stage || !this.layer) return null;
			const recordId = String(partData.recordId || Date.now());
			if (this.seatIdToNode.has(recordId)) {
				return this.seatIdToNode.get(recordId);
			}
			const width = Number(partData.width) || 120;
			const height = Number(partData.height) || 60;
			const step = this.snapStep || 10;
			const x = Math.round((((position && position.x) || 20) / step)) * step;
			const y = Math.round((((position && position.y) || 20) / step)) * step;
			const node = this._createPartNode({
				recordId,
				objectType: partData.objectType,
				settings: partData.settings || {},
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
				const objectType = getVal(rec['オブジェクト種別']);
				const partJSON = getVal(rec['パーツ設定JSON']);
				const widthVal = Number(getVal(rec['幅']) || 0) || undefined;
				const heightVal = Number(getVal(rec['高さ']) || 0) || undefined;
				const payload = {
					recordId,
					seatNumber,
					extNumber: ext,
					pcNumber: pc,
					deptName: dept,
					objectType: objectType || '',
					partSettings: partJSON || '',
					width: widthVal,
					height: heightVal
				};
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
					const objType = get(rec['オブジェクト種別']);
					const partJson = get(rec['パーツ設定JSON']);
					if (partJson && (objType === '図形' || objType === 'テキスト' || objType === '線')) {
						let settings = null;
						try { settings = JSON.parse(partJson); } catch(_) { settings = null; }
						this.addPart({ recordId, objectType: objType, settings, width: w, height: h }, { x, y }, { markPending: false });
					} else {
						const seatNumber = get(rec['座席番号']);
						const dept = get(rec['座席部署']);
						const ik = get(rec[CONFIG.integrationKey]);
						let pc = '', ext = '';
						try { const p = new window.DataIntegrator().parseIntegrationKey(ik); pc = p.PC || ''; ext = p.EXT || ''; } catch(_) {}
						this.addSeat({ recordId, seatNumber, pcNumber: pc, extNumber: ext, deptName: dept, width: w, height: h }, { x, y }, { markPending: false });
					}
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
				const lowerTokens = tokens.map(t => t.toLowerCase());
				// 既存のハイライトを全解除
				this.seatIdToNode.forEach(group => {
					const texts = group.find('Text');
					const bgs = group.find('.row-bg');
					for (let i = 0; i < texts.length; i++) {
						const t = texts[i];
						const base = String(t.text() || '');
						const lower = base.toLowerCase();
						const isHit = lowerTokens.length > 0 && lowerTokens.some(tok => lower.includes(tok));
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
			// 背景クリックで選択解除
			try {
				this.stage.on('mousedown', (e) => {
					try {
						if (!this.isEditing) return;
						// 空白領域クリック時のみ
						if (e.target && (e.target === this.stage || e.target === this.layer)) {
						const prev = this.transformer.nodes() || [];
						prev.forEach(g => {
							try {
								const r = g.findOne('Rect');
								if (!r) return;
								const settings = (g.getAttr && g.getAttr('partSettings')) || {};
								const type = settings && settings.type;
								if (type === 'shape') {
									if (settings.stroke) r.stroke(settings.stroke);
									if (settings.strokeWidth != null) r.strokeWidth(Number(settings.strokeWidth) || 0);
								} else if (g.hasName && g.hasName('seat-node')) {
									r.stroke('#333'); r.strokeWidth(2);
								}
							} catch(_) { /* noop */ }
						});
							this.transformer.nodes([]);
							this._hideAllSizeLabels();
							this._hidePropsPanel();
							this.layer.draw();
						}
					} catch(_) { /* noop */ }
				});
			} catch(_) { /* noop */ }
		}

		_createSeatNode(meta) {
			const group = new Konva.Group({ x: meta.x, y: meta.y, draggable: this.isEditing, name: 'seat-node', id: `seat-${meta.recordId}` });
			group.setAttr('recordId', meta.recordId);
			group.setAttrs({
				seatNumber: meta.seatNumber || '',
				extNumber: meta.extNumber || '',
				pcNumber: meta.pcNumber || '',
				deptName: meta.deptName || ''
			});
			const rect = new Konva.Rect({ width: meta.width, height: meta.height, cornerRadius: 0, stroke: '#333', strokeWidth: 2, fill: '#fff' });
			group.add(rect);
			// 行ハイライト用の背景（テキストの背面・区切り線の背面）
			const rowH = meta.height / 6;
			for (let i = 0; i < 6; i++) {
				group.add(new Konva.Rect({ name: 'row-bg', x: 0, y: i * rowH, width: meta.width, height: rowH, fill: '#fff59d', opacity: 0.7, visible: false, listening: false }));
			}
			// 内部水平線（1/6〜5/6）で6行分割（初期配置、後でレイアウト関数で補正）
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

			// 初回の内部レイアウト（枠線太さを考慮）
			this._layoutSeatInternals(group);
			// テキストが枠内に収まるようフォントサイズを自動調整
			this._fitAllTextsInGroup(group);

			// 選択
			group.on('click', () => {
				if (!this.isEditing) return;
				// 既存選択のスタイルを解除
				try {
					const prev = this.transformer.nodes() || [];
					prev.forEach(n => {
						const r = n.findOne('Rect');
						if (r) { r.stroke('#333'); r.strokeWidth(2); }
					});
				} catch(_) { /* noop */ }
				// 新規選択
				this.transformer.nodes([group]);
				// 選択スタイルを適用
				try {
					const rect = group.findOne('Rect');
					if (rect) {
						const settings = group.getAttr('partSettings') || {};
						// 選択枠は stroke 色のみ青にするが、太さは保持値を維持
						rect.stroke('#1976d2');
						if (settings && settings.type === 'shape' && settings.strokeWidth != null) {
							rect.strokeWidth(Number(settings.strokeWidth) || 2);
						}
					}
				} catch(_) { /* noop */ }
				this._showSizeLabel(group);
				this._showPropsPanelFor(group);
				this.layer.draw();
			});
			// ドラッグ/リサイズ後にメタ更新
			group.on('dragmove', () => { this._applySnap(group); this._updateSizeLabel(group); });
			group.on('dragend', () => { this._applySnap(group); this._syncSeatMeta(group); this._updateSizeLabel(group); });
			group.on('transform', () => { this._updateSizeLabel(group); });
			group.on('transformend', () => { this._syncSeatMeta(group); this._updateSizeLabel(group); });
			this.transformer.on('transform', () => { const nodes = this.transformer.nodes(); nodes && nodes.forEach(n => this._updateSizeLabel(n)); });
			this.transformer.on('transformend', () => { const nodes = this.transformer.nodes(); nodes && nodes.forEach(n => { this._syncSeatMeta(n); this._updateSizeLabel(n); }); });
			// トランスフォーマのハンドル色を強調
			try {
				this.transformer.stroke('#1976d2');
				this.transformer.anchorStroke('#1976d2');
				this.transformer.anchorFill('#ffffff');
				this.transformer.borderStroke('#1976d2');
			} catch(_) { /* noop */ }

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

		_createPartNode(meta) {
			const group = new Konva.Group({ x: meta.x, y: meta.y, draggable: this.isEditing, name: 'part-node', id: `part-${meta.recordId}` });
			group.setAttr('recordId', meta.recordId);
			group.setAttr('objectType', meta.objectType || '');
			group.setAttr('partSettings', meta.settings || {});
			const type = (meta.settings && meta.settings.type) || '';
			if (type === 'shape') {
				const fill = meta.settings.fill || '#FFE08A';
				const stroke = meta.settings.stroke || '#C77700';
				const strokeWidth = Number(meta.settings.strokeWidth) || 2;
				const kind = meta.settings.kind || 'rect';
				if (kind === 'ellipse') {
					group.add(new Konva.Ellipse({ x: meta.width/2, y: meta.height/2, radius: { x: meta.width/2, y: meta.height/2 }, fill, stroke, strokeWidth }));
				} else {
					group.add(new Konva.Rect({ width: meta.width, height: meta.height, cornerRadius: 0, fill, stroke, strokeWidth }));
				}
			} else if (type === 'text') {
				const text = meta.settings.value || '';
				const fontSize = Number(meta.settings.fontSize) || 14;
				const color = meta.settings.color || '#333333';
				const fontStyle = (meta.settings && meta.settings.bold) ? 'bold' : 'normal';
				const fontFamily = (meta.settings && meta.settings.fontFamily) ? meta.settings.fontFamily : 'system-ui';
				// 背景色（任意）
				if (meta.settings && meta.settings.background) {
					const bg = new Konva.Rect({ name: 'text-bg-rect', x: 0, y: 0, width: meta.width, height: meta.height, fill: meta.settings.background, listening: false, strokeEnabled: false });
					group.add(bg);
				}
				const align = (meta.settings && meta.settings.align) ? meta.settings.align : 'left';
				const vAlign = (meta.settings && meta.settings.verticalAlign) ? meta.settings.verticalAlign : 'middle';
				const t = new Konva.Text({ x: 0, y: 0, width: meta.width, height: meta.height, text, fontSize, fill: color, align, verticalAlign: vAlign, fontStyle, fontFamily });
				group.add(t);
				// 背景Rectがある場合にテキストの後ろに回す
				try {
					const bg = group.findOne('.text-bg-rect');
					if (bg) { bg.moveToBottom(); }
				} catch(_) { /* noop */ }
			} else if (type === 'line') {
				const x2 = Number(meta.settings.x2) || meta.width || 120;
				const y2 = Number(meta.settings.y2) || 0;
				const stroke = meta.settings.stroke || '#1E88E5';
				const strokeWidth = Number(meta.settings.strokeWidth) || 3;
				const ln = new Konva.Line({ points: [0, 0, x2, y2], stroke, strokeWidth, hitStrokeWidth: 12 });
				group.add(ln);
				// 直接クリックでも選択・パネル表示できるように
				ln.on('click tap', (e) => { try { e && (e.cancelBubble = true); group.fire('click'); } catch(_) { /* noop */ } });
				// 末端ハンドル（B）のみドラッグ可能
				const handleB = new Konva.Circle({ x: x2, y: y2, radius: 6, fill: '#1976d2', stroke: '#ffffff', strokeWidth: 1, draggable: true, name: 'line-handle-b', visible: false });
				handleB.on('dragmove', () => {
					try {
						const p = handleB.position();
						ln.points([0, 0, p.x, p.y]);
						this._updateSizeLabel(group);
						this.layer && this.layer.batchDraw();
					} catch(_) { /* noop */ }
				});
				handleB.on('dragend', () => { this._syncSeatMeta(group); });
				group.add(handleB);
			} else {
				// fallback: rect
				group.add(new Konva.Rect({ width: meta.width, height: meta.height, cornerRadius: 0, fill: '#f0f0f0', stroke: '#999', strokeWidth: 1 }));
			}

			// 共通: 選択・ドラッグ・サイズ表示（座席と同様の操作感）
			group.on('click tap', () => {
				if (!this.isEditing) return;
				try {
					const prev = this.transformer.nodes() || [];
					prev.forEach(n => {
						const r = n.findOne('Rect');
						if (r) { r.stroke('#333'); r.strokeWidth(2); }
					});
				} catch(_) { /* noop */ }
				this.transformer.nodes([group]);
				// まず全てのラインハンドルを隠す
				try {
					this.seatIdToNode.forEach(g => { const hb = g.findOne('.line-handle-b'); if (hb) hb.visible(false); });
				} catch(_) { /* noop */ }
				try {
					const rect = group.findOne('Rect');
					if (rect) { rect.stroke('#1976d2'); rect.strokeWidth(3); }
					const ln = group.findOne('Line');
					if (ln) { ln.stroke(ln.stroke() || '#1E88E5'); }
				} catch(_) { /* noop */ }
				// リサイズ可能設定
				const t = (group.getAttr('partSettings') && group.getAttr('partSettings').type) || '';
				if (t === 'line') {
					// ラインは末端ハンドルを表示し、Transformerのアンカーは無効
					try { this.transformer.enabledAnchors([]); } catch(_) { /* noop */ }
					const hb = group.findOne('.line-handle-b'); if (hb) hb.visible(true);
					// 上部メニュー（線プロパティ）を有効化し、現在値を反映
					try {
						const ln = group.findOne('Line');
						if (this.lineWidthInputEl) { this.lineWidthInputEl.disabled = false; this.lineWidthInputEl.value = String((ln && ln.strokeWidth && ln.strokeWidth()) || 3); }
						if (this.lineColorBtnEl) { this.lineColorBtnEl.disabled = false; }
					if (this.textBgColorBtnEl) { this.textBgColorBtnEl.disabled = true; }
					this._selectedShapeGroup = null;
						this._selectedLineGroup = group;
					} catch(_) { /* noop */ }
				} else if (t === 'text') {
					// テキスト: ハンドルは四隅・縁。上部メニューをフォント設定に流用
					try {
						this.transformer.enabledAnchors([
							'top-left','top-center','top-right',
							'middle-left','middle-right',
							'bottom-left','bottom-center','bottom-right'
						]);
					} catch(_) { /* noop */ }
					try {
						const tx = group.findOne('Text');
						if (this.lineWidthInputEl) { this.lineWidthInputEl.disabled = true; }
						if (this.fontSizeInputEl) { this.fontSizeInputEl.disabled = false; this.fontSizeInputEl.value = String((tx && tx.fontSize && tx.fontSize()) || 14); }
						if (this.fontBoldCheckboxEl) { this.fontBoldCheckboxEl.disabled = false; this.fontBoldCheckboxEl.checked = (tx && tx.fontStyle && String(tx.fontStyle()).includes('bold')) || false; }
					if (this.fontFamilySelectEl) { this.fontFamilySelectEl.disabled = false; const ff = (tx && tx.fontFamily && tx.fontFamily()) || 'system-ui'; this.fontFamilySelectEl.value = ff; }
					if (this.lineColorBtnEl) { this.lineColorBtnEl.disabled = false; }
					if (this.textBgColorBtnEl) { this.textBgColorBtnEl.disabled = false; }
					// 揃えボタンの活性化と現在値の反映
					try {
						this.textAlignButtons.forEach(b => { b.disabled = false; b.classList.remove('active'); });
						this.textVAlignButtons.forEach(b => { b.disabled = false; b.classList.remove('active'); });
						const settings = group.getAttr('partSettings') || {};
						const a = settings.align || (tx && tx.align && tx.align()) || 'left';
						const va = settings.verticalAlign || (tx && tx.verticalAlign && tx.verticalAlign()) || 'middle';
						this.textAlignButtons.forEach(b => { if (b && b.dataset && b.dataset.align === a) b.classList.add('active'); });
						this.textVAlignButtons.forEach(b => { if (b && b.dataset && b.dataset.valign === va) b.classList.add('active'); });
					} catch(_) { /* noop */ }
					this._selectedShapeGroup = null;
					this._selectedTextGroup = group;
					} catch(_) { /* noop */ }
					// ラインハンドルは全て非表示
					try { const hb = group.findOne('.line-handle-b'); if (hb) hb.visible(false); } catch(_) { /* noop */ }
				} else {
					try {
						this.transformer.enabledAnchors([
							'top-left','top-center','top-right',
							'middle-left','middle-right',
							'bottom-left','bottom-center','bottom-right'
						]);
					} catch(_) { /* noop */ }
					// 図形選択時: 文字系無効、色ボタンは有効（図形色変更）
					try {
						// 図形: 枠線色は「線・文字色…」、塗りは「背景色…」、線太さは有効
						if (this.lineWidthInputEl) {
							this.lineWidthInputEl.disabled = false;
							const r = group.findOne('Rect');
							const e = group.findOne('Ellipse');
							const sw = (r && r.strokeWidth && r.strokeWidth()) || (e && e.strokeWidth && e.strokeWidth()) || 2;
							this.lineWidthInputEl.value = String(sw);
						}
						if (this.lineColorBtnEl) this.lineColorBtnEl.disabled = false; // 図形の枠線色
						if (this.textBgColorBtnEl) this.textBgColorBtnEl.disabled = false; // 図形の塗り
						if (this.fontSizeInputEl) this.fontSizeInputEl.disabled = true;
						if (this.fontBoldCheckboxEl) this.fontBoldCheckboxEl.disabled = true;
						if (this.fontFamilySelectEl) this.fontFamilySelectEl.disabled = true;
						this.textAlignButtons.forEach(b => b.disabled = true);
						this.textVAlignButtons.forEach(b => b.disabled = true);
						this._selectedLineGroup = null; this._selectedTextGroup = null; this._selectedShapeGroup = group;
					} catch(_) { /* noop */ }
				}
				this._showSizeLabel(group);
				this.layer.draw();
			});
			group.on('dragmove', () => { this._applySnap(group); this._updateSizeLabel(group); });
			group.on('dragend', () => { this._applySnap(group); this._syncSeatMeta(group); this._updateSizeLabel(group); });
			this.transformer.on('transform', () => {
				const nodes = this.transformer.nodes();
				nodes && nodes.forEach(n => {
					// 縦/横のハンドル時には片方向のスケールのみ反映
					try {
						const anchor = this.transformer.getActiveAnchor && this.transformer.getActiveAnchor();
						if (anchor && typeof anchor === 'string') {
							if (anchor.includes('middle')) {
								// 左右ハンドル: 横のみ
								n.scaleY(1);
							} else if (anchor.includes('center')) {
								// 上下ハンドル: 縦のみ
								n.scaleX(1);
							}
						}
					} catch(_) { /* noop */ }
					this._updateSizeLabel(n);
				});
			});
			this.transformer.on('transformend', () => { const nodes = this.transformer.nodes(); nodes && nodes.forEach(n => { this._syncSeatMeta(n); this._updateSizeLabel(n); }); });
			return group;
		}

		_fitAllTextsInGroup(group) {
			try {
				// 座席ノードのみフォント自動縮小を適用（パーツのテキストには適用しない）
				if (!(group && group.hasName && group.hasName('seat-node'))) return;
				// 背景Rect（行背景）ではなく、席の本体Rectを対象にする
				let seatRect = null;
				const rects = group.find('Rect');
				if (rects && rects.length) {
					seatRect = rects.find(r => !(r.hasName && r.hasName('text-bg-rect'))) || rects[0];
				}
				if (!seatRect) return;
				const strokeW = Number(seatRect.strokeWidth && seatRect.strokeWidth()) || 0;
				const pad = Math.ceil(strokeW / 2);
				const maxWidth = Math.max(10, seatRect.width() - pad * 2);
				const rowH = Math.max(8, (seatRect.height() - pad * 2) / 6);
				const texts = group.find('Text') || [];
				texts.forEach(t => this._fitTextToRow(t, maxWidth, rowH));
			} catch (_) { /* noop */ }
		}

		_layoutSeatInternals(group) {
			try {
				if (!(group && group.hasName && group.hasName('seat-node'))) return;
				const rect = group.findOne('Rect');
				if (!rect) return;
				const strokeW = Number(rect.strokeWidth && rect.strokeWidth()) || 0;
				const pad = Math.ceil(strokeW / 2);
				const width = Math.max(10, rect.width() - pad * 2);
				const height = Math.max(10, rect.height() - pad * 2);
				const rowH = height / 6;
				// 行区切り線
				const lines = group.find('Line');
				if (lines && lines.length >= 5) {
					[1,2,3,4,5].forEach((i, idx) => {
						const y = pad + rowH * i;
						lines[idx].points([pad, y, pad + width, y]);
					});
				}
				// 背景強調行
				const bgs = group.find('.row-bg');
				if (bgs && bgs.length >= 6) {
					for (let i = 0; i < 6; i++) {
						bgs[i].setAttrs({ x: pad, y: pad + i * rowH, width, height: rowH });
					}
				}
				// テキスト行
				const texts = group.find('Text');
				if (texts && texts.length >= 6) {
					for (let i = 0; i < 6; i++) {
						texts[i].setAttrs({ x: pad, y: pad + i * rowH, width, height: rowH });
					}
				}
			} catch(_) { /* noop */ }
		}

		_fitTextToRow(textNode, maxWidth, maxRowHeight) {
			try {
				const raw = String(textNode.text() || '');
				if (!raw) return;
				textNode.wrap('none');
				const margin = 6;
				const minFontSize = 8;
				let size = Math.min(12, Math.max(minFontSize, Math.floor(maxRowHeight - 2)));
				textNode.fontSize(size);
				let guard = 16;
				while (guard-- > 0 && size > minFontSize && textNode.getTextWidth() > (maxWidth - margin)) {
					size -= 1;
					textNode.fontSize(size);
				}
				// 最終的にも収まらない場合はそのまま（将来: 省略記号など）
			} catch (_) { /* noop */ }
		}

		_showPropsPanelFor(group) {
			try {
				if (!this.propsPanelEl) return;
				const settings = group.getAttr('partSettings') || {};
				let type = settings.type || '';
				// 復元時にpartSettingsが空のケース: ノードから推定
				if (!type) {
					if (group.findOne('Line')) type = 'line';
					else if (group.findOne('Rect') || group.findOne('Ellipse')) type = 'shape';
					else if (group.findOne('Text')) type = 'text';
				}
				if (type !== 'line') { this._hidePropsPanel(); return; }
				this.propsPanelEl.style.display = 'block';
				const widthInput = this.propsPanelEl.querySelector('.prop-line-width');
				const colorSelect = this.propsPanelEl.querySelector('.prop-line-color');
				const ln = group.findOne('Line');
				if (!ln) { this._hidePropsPanel(); return; }
				// 初期値反映
				if (widthInput) widthInput.value = String(ln.strokeWidth() || settings.strokeWidth || 3);
				if (colorSelect) colorSelect.value = String(ln.stroke() || settings.stroke || '#1E88E5');
				// 既存リスナーを一旦外す（多重登録防止）
				try {
					const wi = widthInput; const cs = colorSelect;
					wi && wi.replaceWith(wi.cloneNode(true));
					cs && cs.replaceWith(cs.cloneNode(true));
				} catch(_) { /* noop */ }
				const widthInputRef = this.propsPanelEl.querySelector('.prop-line-width');
				const colorSelectRef = this.propsPanelEl.querySelector('.prop-line-color');

				// 変更イベント
				widthInputRef && widthInputRef.addEventListener('input', (ev) => {
					try {
						const v = Math.max(1, Math.min(20, Number(ev.target.value || 3)));
						ln.strokeWidth(v);
						settings.strokeWidth = v;
						group.setAttr('partSettings', settings);
						this.pendingChanges.set(String(group.getAttr('recordId')), this._buildPendingFromGroup(group));
						this.layer && this.layer.batchDraw();
					} catch(_) { /* noop */ }
				});
				colorSelectRef && colorSelectRef.addEventListener('change', (ev) => {
					try {
						const color = String(ev.target.value || '#1E88E5');
						ln.stroke(color);
						settings.stroke = color;
						group.setAttr('partSettings', settings);
						this.pendingChanges.set(String(group.getAttr('recordId')), this._buildPendingFromGroup(group));
						this.layer && this.layer.batchDraw();
					} catch(_) { /* noop */ }
				});
			} catch(_) { /* noop */ }
		}

		_hidePropsPanel() {
			try { if (this.propsPanelEl) this.propsPanelEl.style.display = 'none'; } catch(_) { /* noop */ }
		}

		_applyLineWidthFromControls() {
			try {
				if (!this.lineWidthInputEl) return;
				const v = Math.max(1, Math.min(60, Number(this.lineWidthInputEl.value || 3)));
				if (this._selectedLineGroup) {
					const ln = this._selectedLineGroup.findOne('Line');
					if (ln) {
						ln.strokeWidth(v);
						const settings = this._selectedLineGroup.getAttr('partSettings') || {}; settings.strokeWidth = v; this._selectedLineGroup.setAttr('partSettings', settings);
						this.pendingChanges.set(String(this._selectedLineGroup.getAttr('recordId')), this._buildPendingFromGroup(this._selectedLineGroup));
					}
				}
				// 図形の枠線太さ
				if (this._selectedShapeGroup) {
					const r = this._selectedShapeGroup.findOne('Rect');
					const e = this._selectedShapeGroup.findOne('Ellipse');
					if (r) r.strokeWidth(v);
					if (e) e.strokeWidth(v);
					const settings = this._selectedShapeGroup.getAttr('partSettings') || {}; settings.strokeWidth = v; this._selectedShapeGroup.setAttr('partSettings', settings);
					this.pendingChanges.set(String(this._selectedShapeGroup.getAttr('recordId')), this._buildPendingFromGroup(this._selectedShapeGroup));
				}
				// 太さUIは線用。テキストは fontSizeInputEl を使用
				this.layer && this.layer.batchDraw();
			} catch(_) { /* noop */ }
		}

		_applyLineColorFromControls() {
			try {
				const color = String(this._pendingPickedColor || '#1E88E5');
				// 図形の枠線色（stroke）
				if (this._selectedShapeGroup) {
					const r = this._selectedShapeGroup.findOne('Rect');
					const e = this._selectedShapeGroup.findOne('Ellipse');
					if (r) r.stroke(color);
					if (e) e.stroke(color);
					const settings = this._selectedShapeGroup.getAttr('partSettings') || {}; settings.stroke = color; this._selectedShapeGroup.setAttr('partSettings', settings);
					this.pendingChanges.set(String(this._selectedShapeGroup.getAttr('recordId')), this._buildPendingFromGroup(this._selectedShapeGroup));
				}
				if (this._selectedLineGroup) {
					const ln = this._selectedLineGroup.findOne('Line');
					if (ln) {
						ln.stroke(color);
						const settings = this._selectedLineGroup.getAttr('partSettings') || {}; settings.stroke = color; this._selectedLineGroup.setAttr('partSettings', settings);
						this.pendingChanges.set(String(this._selectedLineGroup.getAttr('recordId')), this._buildPendingFromGroup(this._selectedLineGroup));
					}
				}
				if (this._selectedTextGroup && (!this._paletteApplyTarget || this._paletteApplyTarget === 'color')) {
					const tx = this._selectedTextGroup.findOne('Text');
					if (tx) {
						tx.fill(color);
						const settings = this._selectedTextGroup.getAttr('partSettings') || {}; settings.color = color; this._selectedTextGroup.setAttr('partSettings', settings);
						this.pendingChanges.set(String(this._selectedTextGroup.getAttr('recordId')), this._buildPendingFromGroup(this._selectedTextGroup));
					}
				}
				this.layer && this.layer.batchDraw();
			} catch(_) { /* noop */ }
		}

		_applyTextBgColorFromControls() {
			try {
				const color = String(this._pendingPickedColor || '#FFFFFF');
				// 図形背景色（塗り）
				if (this._selectedShapeGroup) {
					const r = this._selectedShapeGroup.findOne('Rect');
					const e = this._selectedShapeGroup.findOne('Ellipse');
					if (r) r.fill(color);
					if (e) e.fill(color);
					const settingsShape = this._selectedShapeGroup.getAttr('partSettings') || {}; settingsShape.fill = color; this._selectedShapeGroup.setAttr('partSettings', settingsShape);
					this.pendingChanges.set(String(this._selectedShapeGroup.getAttr('recordId')), this._buildPendingFromGroup(this._selectedShapeGroup));
				}
				// テキスト背景色
				if (this._selectedTextGroup) {
					const tx = this._selectedTextGroup.findOne('Text');
					if (tx) {
						let bg = this._selectedTextGroup.findOne('.text-bg-rect');
						if (!bg) {
							bg = new Konva.Rect({ name: 'text-bg-rect', x: tx.x(), y: tx.y(), width: tx.width(), height: tx.height(), fill: color, listening: false, strokeEnabled: false });
							this._selectedTextGroup.add(bg);
							bg.moveToBottom();
						} else {
							bg.fill(color);
							bg.position({ x: tx.x(), y: tx.y() });
							bg.size({ width: tx.width(), height: tx.height() });
						}
						const settingsText = this._selectedTextGroup.getAttr('partSettings') || {}; settingsText.background = color; this._selectedTextGroup.setAttr('partSettings', settingsText);
						this.pendingChanges.set(String(this._selectedTextGroup.getAttr('recordId')), this._buildPendingFromGroup(this._selectedTextGroup));
					}
				}
				this.layer && this.layer.batchDraw();
			} catch(_) { /* noop */ }
		}

		_applyTextFontSizeFromControls() {
			try {
				if (!this.fontSizeInputEl || !this._selectedTextGroup) return;
				const v = Math.max(8, Math.min(72, Number(this.fontSizeInputEl.value || 14)));
				const tx = this._selectedTextGroup.findOne('Text');
				if (!tx) return;
				tx.fontSize(v);
				const settings = this._selectedTextGroup.getAttr('partSettings') || {}; settings.fontSize = v; this._selectedTextGroup.setAttr('partSettings', settings);
				this.pendingChanges.set(String(this._selectedTextGroup.getAttr('recordId')), this._buildPendingFromGroup(this._selectedTextGroup));
				this.layer && this.layer.batchDraw();
			} catch(_) { /* noop */ }
		}

		_applyTextBoldFromControls() {
			try {
				if (!this.fontBoldCheckboxEl || !this._selectedTextGroup) return;
				const on = !!this.fontBoldCheckboxEl.checked;
				const tx = this._selectedTextGroup.findOne('Text');
				if (!tx) return;
				tx.fontStyle(on ? 'bold' : 'normal');
				const settings = this._selectedTextGroup.getAttr('partSettings') || {}; settings.bold = on; this._selectedTextGroup.setAttr('partSettings', settings);
				this.pendingChanges.set(String(this._selectedTextGroup.getAttr('recordId')), this._buildPendingFromGroup(this._selectedTextGroup));
				this.layer && this.layer.batchDraw();
			} catch(_) { /* noop */ }
		}

		_applyTextFontFamilyFromControls() {
			try {
				if (!this.fontFamilySelectEl || !this._selectedTextGroup) return;
				const ff = String(this.fontFamilySelectEl.value || 'system-ui');
				const tx = this._selectedTextGroup.findOne('Text');
				if (!tx) return;
				tx.fontFamily(ff);
				const settings = this._selectedTextGroup.getAttr('partSettings') || {}; settings.fontFamily = ff; this._selectedTextGroup.setAttr('partSettings', settings);
				this.pendingChanges.set(String(this._selectedTextGroup.getAttr('recordId')), this._buildPendingFromGroup(this._selectedTextGroup));
				this.layer && this.layer.batchDraw();
			} catch(_) { /* noop */ }
		}

		_applyTextAlignFromControls(align) {
			try {
				if (!this._selectedTextGroup) return;
				const tx = this._selectedTextGroup.findOne('Text');
				if (!tx) return;
				tx.align(align);
				const settings = this._selectedTextGroup.getAttr('partSettings') || {}; settings.align = align; this._selectedTextGroup.setAttr('partSettings', settings);
				this.pendingChanges.set(String(this._selectedTextGroup.getAttr('recordId')), this._buildPendingFromGroup(this._selectedTextGroup));
				// トグル状態を更新
				try { this.textAlignButtons.forEach(b => { if (!b) return; if (b.dataset && b.dataset.align === align) b.classList.add('active'); else b.classList.remove('active'); }); } catch(_) { /* noop */ }
				this.layer && this.layer.batchDraw();
			} catch(_) { /* noop */ }
		}

		_applyTextVerticalAlignFromControls(vAlign) {
			try {
				if (!this._selectedTextGroup) return;
				const tx = this._selectedTextGroup.findOne('Text');
				if (!tx) return;
				tx.verticalAlign(vAlign);
				const settings = this._selectedTextGroup.getAttr('partSettings') || {}; settings.verticalAlign = vAlign; this._selectedTextGroup.setAttr('partSettings', settings);
				this.pendingChanges.set(String(this._selectedTextGroup.getAttr('recordId')), this._buildPendingFromGroup(this._selectedTextGroup));
				// トグル状態を更新
				try { this.textVAlignButtons.forEach(b => { if (!b) return; if (b.dataset && b.dataset.valign === vAlign) b.classList.add('active'); else b.classList.remove('active'); }); } catch(_) { /* noop */ }
				this.layer && this.layer.batchDraw();
			} catch(_) { /* noop */ }
		}

		_toggleColorPalette(ev) {
			try {
				if (!this.lineColorBtnEl) return;
				if (this.lineColorPaletteEl) { this._closePalette(); return; }
				// パレット作成
				const palette = document.createElement('div');
				palette.className = 'color-palette';
				// 12x12 パレット（系統色ごと、上段ほど淡く、下段ほど濃く）
				const colors = [
					// グレー系（淡→濃）12
					'#FAFAFA','#F2F2F2','#EDEDED','#E5E5E5','#DDDDDD','#D5D5D5','#C7C7C7','#B9B9B9','#9E9E9E','#7F7F7F','#5C5C5C','#2E2E2E',
					// レッド系（淡→濃）12
					'#FDEAEA','#FBD0D0','#F8B6B6','#F59C9C','#F18282','#ED6868','#E94E4E','#E53434','#D91F1F','#B71515','#8F1010','#650A0A',
					// オレンジ系 12
					'#FFF2E6','#FFE4CC','#FFD7B3','#FFC999','#FFBB80','#FFAD66','#FF9F4D','#FF9133','#F27F1A','#D96F12','#B85F0E','#8C480A',
					// イエロー系 12
					'#FFFBE6','#FFF7CC','#FFF2B3','#FFEE99','#FFE980','#FFE566','#FFE04D','#FFDC33','#F2CE1A','#D9B912','#B89C0E','#8C760A',
					// グリーン系 12
					'#ECF8EE','#D6F0DA','#C0E8C6','#AADFB2','#94D79E','#7ECE8A','#68C676','#52BE62','#3AA64A','#2E8A3C','#236E2F','#1A5323',
					// ティール/シアン系 12
					'#E8FAFA','#D1F3F3','#BAEDED','#A3E6E6','#8CDFDF','#75D9D9','#5ED2D2','#47CCCC','#30C5C5','#279E9E','#1E7777','#155050',
					// ブルー系 12
					'#EAF3FF','#D4E7FF','#BEDBFF','#A8CFFF','#92C3FF','#7CB7FF','#66ABFF','#509FFF','#398FFF','#2F76D9','#255EB3','#1B458C',
					// インディゴ/パープル系 12
					'#F1ECFA','#E3D9F5','#D5C6F0','#C7B3EB','#B9A0E6','#AB8DE1','#9D7ADC','#8F67D7','#7B52C4','#6342A0','#4C317C','#362258',
					// マゼンタ/ピンク系 12
					'#FCEAF4','#F8D1E6','#F4B8D9','#F09FCC','#EC86BE','#E86DB0','#E454A3','#E03B95','#C82D80','#A22467','#7C1B4E','#551235',
					// ブラウン系 12
					'#F6EFEA','#EADFD4','#DFCFBE','#D3BFA9','#C7AF93','#BB9F7D','#AF8F67','#A37F51','#8C6B42','#715636','#57422A','#3C2E1E',
					// ゴールド系 12
					'#FFF7E6','#FEEFCC','#FEE6B3','#FEDD99','#FED380','#FEC966','#FEBF4D','#FEB533','#E0A41F','#C08B19','#9F7214','#7F590F',
					// ブラック/特別枠 12
					'#FFFFFF','#F5F5F5','#EEEEEE','#E0E0E0','#BDBDBD','#9E9E9E','#757575','#616161','#424242','#303030','#212121','#000000'
				];
				colors.forEach(c => {
					const sw = document.createElement('div');
					sw.className = 'color-swatch';
					sw.style.backgroundColor = c;
					sw.addEventListener('click', () => {
						this._pendingPickedColor = c;
						if (this._paletteApplyTarget === 'textBg') {
							this._applyTextBgColorFromControls();
						} else {
							this._applyLineColorFromControls();
						}
						this._closePalette();
					});
					palette.appendChild(sw);
				});
				// 配置（ボタンの下）
				const anchorBtn = (this._paletteApplyTarget === 'textBg') ? this.textBgColorBtnEl : this.lineColorBtnEl;
				const rect = anchorBtn.getBoundingClientRect();
				palette.style.left = Math.round(rect.left) + 'px';
				palette.style.top = Math.round(rect.bottom + 6 + window.scrollY) + 'px';
				palette.style.position = 'absolute';
				document.body.appendChild(palette);
				this.lineColorPaletteEl = palette;
				// 外側クリックで閉じる
				this._onDocClickPalette = (e) => {
					try {
						if (!this.lineColorPaletteEl) return;
						if (!this.lineColorPaletteEl.contains(e.target) && e.target !== this.lineColorBtnEl && e.target !== this.textBgColorBtnEl) {
							this._closePalette();
						}
					} catch(_) { /* noop */ }
				};
				document.addEventListener('mousedown', this._onDocClickPalette, true);
			} catch(_) { /* noop */ }
		}

		_closePalette() {
			try {
				if (this.lineColorPaletteEl && this.lineColorPaletteEl.parentNode) {
					this.lineColorPaletteEl.parentNode.removeChild(this.lineColorPaletteEl);
				}
				this.lineColorPaletteEl = null;
				if (this._onDocClickPalette) {
					document.removeEventListener('mousedown', this._onDocClickPalette, true);
					this._onDocClickPalette = null;
				}
			} catch(_) { /* noop */ }
		}

		_buildPendingFromGroup(group) {
			try {
				const pos = group.position();
				const rect = group.findOne('Rect');
				const ellipse = group.findOne('Ellipse');
				const ln = group.findOne('Line');
				let width = 0, height = 0;
				if (rect) { width = Math.round(rect.width()); height = Math.round(rect.height()); }
				else if (ellipse) { width = Math.round((ellipse.radiusX() || 0) * 2); height = Math.round((ellipse.radiusY() || 0) * 2); }
				else if (ln) { const p = ln.points(); width = Math.max(1, Math.abs(Math.round(p[2] || 0))); height = Math.max(1, Math.abs(Math.round(p[3] || 0))); }
				else { const t = group.findOne('Text'); if (t) { width = Math.round(t.width()); height = Math.round(t.height()); } }
				return { x: Math.round(pos.x), y: Math.round(pos.y), width, height, display: true };
			} catch(_) { return { x: 0, y: 0, width: 0, height: 0, display: true }; }
		}

		deleteSelectedSeats() {
			try {
				if (!this.isEditing || !this.transformer) return;
				const selectedNodes = this.transformer.nodes() || [];
				if (!selectedNodes.length) return;
				selectedNodes.forEach(group => {
					try {
						if (!group || !group.getAttr) return;
						const recordId = String(group.getAttr('recordId'));
						if (!recordId) return;
						// 現在の位置とサイズを取得（保険）
						const pos = group.position();
						const rect = group.findOne('Rect');
						const scaleX = group.scaleX() || 1;
						const scaleY = group.scaleY() || 1;
						const width = Math.max(10, Math.round((rect && rect.width ? rect.width() : this.fixedSeatSize) * scaleX));
						const height = Math.max(10, Math.round((rect && rect.height ? rect.height() : this.fixedSeatSize) * scaleY));
						const step = this.snapStep || 10;
						const x = Math.round(pos.x / step) * step;
						const y = Math.round(pos.y / step) * step;

						// 保存差分: 表示フラグをfalseに
						this.pendingChanges.set(recordId, { x, y, width, height, display: false });

						// 左リストへ戻す（既に存在しない場合のみ追加）
						if (this.leftListEl && !this.leftListEl.querySelector(`.seat-item[data-seat-id="${recordId}"]`)) {
							const seatNumber = String(group.getAttr('seatNumber') || '');
							const extNumber = String(group.getAttr('extNumber') || '');
							const pcNumber = String(group.getAttr('pcNumber') || '');
							const deptName = String(group.getAttr('deptName') || '');
							const item = document.createElement('div');
							item.className = 'seat-item';
							item.draggable = true;
							item.setAttribute('data-seat-id', recordId);
							item.setAttribute('data-seat-number', seatNumber);
							item.setAttribute('data-seat-dept', deptName);
							item.setAttribute('data-seat', JSON.stringify({ recordId, seatNumber, extNumber, pcNumber, deptName }));
							item.textContent = deptName ? `${seatNumber}（${deptName}）` : `${seatNumber}`;
							this.leftListEl.appendChild(item);
							this._applyListFilter();
						}

						// ノードを削除
						const id = String(recordId);
						if (this.sizeLabelById && this.sizeLabelById.has(id)) {
							try { const lbl = this.sizeLabelById.get(id); lbl && lbl.visible(false); } catch(_) { /* noop */ }
						}
						this.seatIdToNode.delete(id);
						group.destroy();
					} catch(_) { /* noop */ }
				});
				this.transformer.nodes([]);
				this.layer && this.layer.batchDraw();
			} catch (_) { /* noop */ }
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
				const ellipse = group.findOne('Ellipse');
				const ln = group.findOne('Line');
				const scaleX = group.scaleX() || 1;
				const scaleY = group.scaleY() || 1;
				let w = 0, h = 0;
				if (rect) { w = Math.max(1, Math.round(rect.width() * scaleX)); h = Math.max(1, Math.round(rect.height() * scaleY)); }
				else if (ellipse) { w = Math.max(1, Math.round((ellipse.radiusX() * 2) * scaleX)); h = Math.max(1, Math.round((ellipse.radiusY() * 2) * scaleY)); }
				else if (ln) { const p = ln.points(); w = Math.max(1, Math.abs(Math.round((p[2] || 0) * scaleX))); h = Math.max(1, Math.abs(Math.round((p[3] || 0) * scaleY))); }
				else { const t = group.findOne('Text'); if (t) { w = Math.max(1, Math.round((t.width && t.width()) ? t.width() * scaleX : 0)); h = Math.max(1, Math.round((t.height && t.height()) ? t.height() * scaleY : 0)); } }
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
				// 図形・座席・テキスト・線に応じてサイズ取得
				const settings = group.getAttr('partSettings') || {};
				const rect = group.findOne('Rect');
				const ellipse = group.findOne('Ellipse');
				const line = group.findOne('Line');
				const textNode = group.findOne('Text');
				// 優先的にpartSettings.typeから種別を判断（背景Rectがあっても誤判定しない）
				let partType = settings.type || '';
				if (!partType) {
					if (line) partType = 'line';
					else if (textNode) partType = 'text';
					else if (rect || ellipse) partType = 'shape';
				}
				// スケールを実寸に反映
				const scaleX = group.scaleX() || 1;
				const scaleY = group.scaleY() || 1;
				let width = 0, height = 0;
				if (partType === 'line') {
					// ラインは幅/高さは便宜上の外接矩形サイズとして保存
					const pts = line ? line.points() : [0, 0, 0, 0];
					const x2 = (pts[2] || 0) * scaleX;
					const y2 = (pts[3] || 0) * scaleY;
					if (line) line.points([0, 0, x2, y2]);
					width = Math.max(1, Math.abs(Math.round(x2)));
					height = Math.max(1, Math.abs(Math.round(y2)));
				} else if (partType === 'text') {
					// テキストパーツはTextの幅高さを基準にしてスケールを反映。フォントサイズは変更しない
					if (textNode) {
						const tw = (textNode.width && textNode.width()) ? textNode.width() : 0;
						const th = (textNode.height && textNode.height()) ? textNode.height() : 0;
						width = Math.max(10, Math.round(tw * scaleX));
						height = Math.max(10, Math.round(th * scaleY));
						textNode.width(width);
						textNode.height(height);
						// 背景Rectがあれば追従
						const tbg = group.findOne('.text-bg-rect');
						if (tbg) {
							tbg.position({ x: textNode.x(), y: textNode.y() });
							tbg.size({ width, height });
						}
					}
				} else if (rect) {
					width = Math.max(10, Math.round(rect.width() * scaleX));
					height = Math.max(10, Math.round(rect.height() * scaleY));
					rect.width(width); rect.height(height);
				} else if (ellipse) {
					const rx = Math.max(5, Math.round(ellipse.radiusX() * scaleX));
					const ry = Math.max(5, Math.round(ellipse.radiusY() * scaleY));
					ellipse.radius({ x: rx, y: ry });
					width = rx * 2; height = ry * 2;
				} else {
					// テキスト
					const t = group.findOne('Text');
					if (t) {
						width = Math.max(10, Math.round((t.width && t.width()) ? t.width() * scaleX : (group.width && group.width()) ? group.width() * scaleX : 120));
						height = Math.max(10, Math.round((t.height && t.height()) ? t.height() * scaleY : (group.height && group.height()) ? group.height() * scaleY : 30));
						t.width(width); t.height(height);
					}
				}
				group.scale({ x: 1, y: 1 });
				// 内部線とテキストも更新（6行対応）
				const lines = group.find('Line');
				const rowH = height / 6;
				if (lines && lines.length >= 5) {
					[1,2,3,4,5].forEach((i, idx) => {
						const y = rowH * i;
						lines[idx].points([0, y, width, y]);
					});
				}
				// 座席ノードは枠線太さを考慮して再配置
				if (group.hasName && group.hasName('seat-node')) {
					this._layoutSeatInternals(group);
				} else {
					// 既存の（座席以外）
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
				}
				// リサイズ後のフォント自動調整は座席ノードに限定
				if (group.hasName && group.hasName('seat-node')) {
					this._fitAllTextsInGroup(group);
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
			if (this.deleteButtonEl) this.deleteButtonEl.disabled = false;
			this._updateEditControlsVisibility(true);
			// Delete/Backspace で選択座席を削除
			if (!this._onKeyDownDelete) {
				this._onKeyDownDelete = (e) => {
					try {
						if (!this.isEditing) return;
						const tgt = e.target || {};
						const tag = (tgt.tagName || '').toLowerCase();
						if (tag === 'input' || tag === 'textarea' || tgt.isContentEditable) return;
						if (e.key === 'Delete' || e.key === 'Backspace') {
							e.preventDefault();
							this.deleteSelectedSeats();
						}
					} catch(_) { /* noop */ }
				};
				document.addEventListener('keydown', this._onKeyDownDelete);
			}
		}
		exitEditMode() {
			this.isEditing = false;
			this.transformer.nodes([]);
			this._hideGrid();
			this._hideAllSizeLabels();
			this.seatIdToNode.forEach(node => node.draggable(false));
			if (this.deleteButtonEl) this.deleteButtonEl.disabled = true;
			this._updateEditControlsVisibility(false);
			// キーハンドラ解除
			if (this._onKeyDownDelete) {
				document.removeEventListener('keydown', this._onKeyDownDelete);
				this._onKeyDownDelete = null;
			}
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
					// パーツ設定JSON（線の太さ/色など）も保存
					try {
						const group = this.seatIdToNode.get(String(recordId));
						if (group) {
							const settings = group.getAttr('partSettings');
							if (settings) rec.record['パーツ設定JSON'] = { value: JSON.stringify(settings) };
						}
					} catch(_) { /* noop */ }
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

		/**
		 * パーツ（図形/テキスト/線）を座席台帳へ新規保存
		 * まずは保存優先（表示は後続フェーズで実装）
		 */
		async createPartRecord(objectType) {
			try {
				if (!this.isEditing) { alert('編集ONにしてから実行してください'); return; }
				const token = this.siteSelectEl ? this.siteSelectEl.value : '';
				const parsed = this._parseSiteFloorToken(token);
				const site = parsed.site || '';
				const floor = parsed.floor;
				if (!site || !Number.isFinite(floor)) { alert('拠点+階を選択してください'); return; }

				const appId = CONFIG.getAppIdByLedgerName('座席台帳') || 8;
				const prefix = objectType === '図形' ? 'S-' : (objectType === 'テキスト' ? 'T-' : 'L-');
				const nextSeatNumber = await this._generateNextPartNumber(prefix, site, floor, objectType);

				// デフォルト設定
				let defaults = {};
				if (objectType === '図形') {
					defaults = { type: 'shape', kind: 'rect', fill: '#FFE08A', stroke: '#C77700' };
				} else if (objectType === 'テキスト') {
					defaults = { type: 'text', value: 'テキスト', fontSize: 14, color: '#333333' };
				} else if (objectType === '線') {
					defaults = { type: 'line', x2: 120, y2: 0, stroke: '#1E88E5', strokeWidth: 3 };
				}

				// 初期座標・寸法（暫定）
				const pos = { x: 20, y: 20 };
				const size = (objectType === '図形') ? { width: 120, height: 80 }
					: (objectType === 'テキスト') ? { width: 120, height: 30 }
					: { width: 0, height: 0 };

				const record = {
					'座席拠点': { value: site },
					'階': { value: Number(floor) },
					'座席番号': { value: nextSeatNumber },
					'座標X': { value: Number(pos.x) },
					'座標Y': { value: Number(pos.y) },
					'幅': { value: Number(size.width) },
					'高さ': { value: Number(size.height) },
					'座席表表示': { value: 'true' },
					'オブジェクト種別': { value: objectType },
					'パーツ設定JSON': { value: JSON.stringify(defaults) }
				};

				const res = await kintone.api(kintone.api.url('/k/v1/record', true), 'POST', { app: String(appId), record });
				// 画面へ即時反映
				this.addPart({ recordId: res && res.id, objectType, settings: defaults, width: size.width, height: size.height }, pos, { markPending: false });
				this.layer && this.layer.batchDraw();
				alert(`${objectType}パーツを保存して表示しました（${nextSeatNumber}）`);
			} catch (e) {
				console.error('パーツ保存エラー', e);
				alert('パーツの保存に失敗しました');
			}
		}

		async _generateNextPartNumber(prefix, site, floor, objectType) {
			try {
				const appId = CONFIG.getAppIdByLedgerName('座席台帳') || 8;
				const conds = [];
				if (site) conds.push(`座席拠点 in ("${site}")`);
				if (Number.isFinite(floor)) conds.push(`階 = ${Number(floor)}`);
				conds.push(`座席番号 like "${prefix}"`);
				if (objectType) conds.push(`オブジェクト種別 in ("${objectType}")`);
				const query = conds.join(' and ') + ' order by 座席番号 desc limit 1';
				const res = await kintone.api(kintone.api.url('/k/v1/records', true), 'GET', { app: String(appId), query });
				const last = (res.records && res.records[0] && res.records[0]['座席番号'] && res.records[0]['座席番号'].value) || '';
				let next = 1;
				const m = String(last).match(/^([A-Z]-)(\d{1,})$/);
				if (m && m[1] === prefix) {
					next = (parseInt(m[2], 10) || 0) + 1;
				}
				return prefix + String(next).padStart(5, '0');
			} catch (e) {
				return prefix + '00001';
			}
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


