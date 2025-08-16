/**
 * バリデーションエンジン
 * - 保存時、セル編集時、セル交換/分離時に使用
 * - ルールは最小限（必須、数値）から開始。将来的に追加可能
 */
class ValidationEngine {
  constructor() {
    // レコードID（統合キー）→ 不正フィールドSet
    this.invalidFields = new Map();
    // レコードID（統合キー）→ { fieldKey: errorMessage(joined) }
    this.invalidFieldMessages = new Map();
  }

  // ===== 公開API =====

  /**
   * 単一フィールドを検証し、UIに反映
   */
  async validateField(recordIndex, fieldKey) {
    try {
      const row = window.tableRenderer?.currentSearchResults?.[recordIndex];
      if (!row) return true;

      const column = CONFIG.integratedTableConfig.columns.find(c => c.key === fieldKey);
      if (!column) return true;

      const value = row[fieldKey];
      const errors = await this.runFieldRules(column, value, row);

      if (errors.length > 0) {
        this.markInvalid(recordIndex, fieldKey, errors);
        return false;
      } else {
        this.clearInvalid(recordIndex, fieldKey);
        return true;
      }
    } catch (error) {
      console.error('バリデーションエラー(validateField):', error);
      return true; // バリデーション失敗時はブロックしない
    }
  }

  /**
   * 1行すべてのカラムを検証し、UIに反映
   */
  async validateRow(recordIndex) {
    const row = window.tableRenderer?.currentSearchResults?.[recordIndex];
    if (!row) return true;

    const validations = CONFIG.integratedTableConfig.columns
      .filter(c => !c.isChangeFlag && !c.isDetailLink && !c.isConsistencyCheck)
      .map(async (column) => {
        const value = row[column.key];
        const errors = await this.runFieldRules(column, value, row);
        if (errors.length > 0) {
          this.markInvalid(recordIndex, column.key, errors);
          return false;
        } else {
          this.clearInvalid(recordIndex, column.key);
          return true;
        }
      });

    const results = await Promise.all(validations);
    return results.every(Boolean);
  }

  /**
   * 保存前の検証。対象行インデックス配列に対して実行
   * 戻り値: true=すべてOK / false=不正あり
   */
  async validateBeforeSave(changedIndices) {
    if (!changedIndices || changedIndices.length === 0) return true;
    let allValid = true;

    for (const idx of changedIndices) {
      const ok = await this.validateRow(idx);
      if (!ok) allValid = false;
    }

    if (!allValid) {
      try {
        // 不正箇所の要約（最大3件の例示）を作成
        const examples = [];
        let totalErrors = 0;
        for (const idx of changedIndices) {
          const recordId = window.virtualScroll?.getRecordId(idx);
          if (!recordId) continue;
          const fieldSet = this.invalidFields.get(recordId);
          if (!fieldSet || fieldSet.size === 0) continue;
          fieldSet.forEach(fieldKey => {
            totalErrors++;
            if (examples.length < 3) {
              const col = CONFIG.integratedTableConfig.columns.find(c => c.key === fieldKey);
              const label = col ? col.label : fieldKey;
              const msgMap = this.invalidFieldMessages.get(recordId);
              const msg = msgMap && msgMap[fieldKey] ? msgMap[fieldKey] : '不正な値です';
              examples.push(`行${idx + 1}「${label}」: ${msg}`);
            }
          });
        }
        const exampleText = examples.length > 0 ? `（例: ${examples.join(' / ')}${totalErrors > examples.length ? ` 他${totalErrors - examples.length}件` : ''}）` : '';
        this.showToast(`未入力または不正な値が見つかりました。赤いセルを修正してください ${exampleText}`.trim(), 'error');
      } catch (e) {
        this.showToast('未入力または不正な値があります。ハイライトされたセルを修正してください。', 'error');
      }
    }
    return allValid;
  }

  // ===== ルール実装（最小） =====

  /**
   * カラム定義と値に基づき、ルールを実行してエラーメッセージ配列を返す
   */
  async runFieldRules(column, value, row = null) {
    const errors = [];

    // 1) 固定必須（列定義 required:true） — 設定で無効化可能
    if (CONFIG?.validation?.enforceColumnRequired) {
      if (column.required && this.isEmpty(value)) {
        errors.push('必須');
      }
    }

    // 2) 数値ルール（フィールドタイプ=number）
    try {
      const fieldInfo = await window.virtualScroll?.getFieldInfo(column.appId, column.fieldCode);
      if (fieldInfo && fieldInfo.type === 'number' && !this.isEmpty(value)) {
        if (!this.isNumeric(value)) {
          errors.push('数値のみ');
        }
      }
    } catch (e) {
      // 型取得失敗時はスキップ
    }

    // 3) 統一ルール（CONFIG.validation.rules）
    try {
      if (row && Array.isArray(CONFIG?.validation?.rules)) {
        for (const rule of CONFIG.validation.rules) {
          // when 条件があれば評価
          const whenMatched = (rule.when || []).every(cond => this.evaluateCondition(row, cond));
          if (!whenMatched) continue;

          const assertions = rule.assert || {};
          if (!Object.prototype.hasOwnProperty.call(assertions, column.key)) continue;

          const requirement = assertions[column.key] || {};
          const current = value;
          const curArr = this.toArrayValue(current);

          // 状態系（empty / notEmpty / any / required）
          const state = requirement.state || (requirement.required ? 'notEmpty' : undefined);
          if (state === 'empty' && !this.isEmpty(current)) {
            errors.push(this.buildRuleMessage(column, 'stateEmpty', { }, rule.when, row));
          } else if (state === 'notEmpty' && this.isEmpty(current)) {
            errors.push(this.buildRuleMessage(column, 'stateNotEmpty', { }, rule.when, row));
          }

          // 値比較系（equals / notEquals / equalsAny / containsAll）
          if (Object.prototype.hasOwnProperty.call(requirement, 'equals')) {
            if (String(current ?? '') !== String(requirement.equals ?? '')) {
              errors.push(this.buildRuleMessage(column, 'equals', { equals: requirement.equals }, rule.when, row));
            }
          }
          if (Object.prototype.hasOwnProperty.call(requirement, 'notEquals')) {
            if (String(current ?? '') === String(requirement.notEquals ?? '')) {
              errors.push(this.buildRuleMessage(column, 'notEquals', { notEquals: requirement.notEquals }, rule.when, row));
            }
          }
          if (Array.isArray(requirement.equalsAny)) {
            const ok = requirement.equalsAny.some(x => curArr.includes(String(x)));
            if (!ok) {
              errors.push(this.buildRuleMessage(column, 'equalsAny', { equalsAny: requirement.equalsAny }, rule.when, row));
            }
          }
          if (Array.isArray(requirement.containsAll)) {
            const missing = requirement.containsAll.filter(x => !curArr.includes(String(x)));
            if (missing.length > 0) {
              errors.push(this.buildRuleMessage(column, 'containsAll', { containsAll: requirement.containsAll }, rule.when, row));
            }
          }
        }
      }
    } catch (e) {
      // 無視
    }

    return errors;
  }

  // 汎用条件評価
  evaluateCondition(row, cond) {
    const val = row[cond.fieldKey];
    const arr = this.toArrayValue(val);
    switch (cond.operator) {
      case 'notEmpty':
        return !this.isEmpty(val);
      case 'empty':
        return this.isEmpty(val);
      case 'equals':
        return String(val ?? '') === String(cond.value ?? '');
      case 'notEquals':
        return String(val ?? '') !== String(cond.value ?? '');
      case 'equalsAny':
        return Array.isArray(cond.value) && cond.value.some(x => arr.includes(String(x)));
      default:
        return false;
    }
  }

  // 値を配列に正規化
  toArrayValue(v) {
    if (Array.isArray(v)) return v.map(x => String(x));
    if (v && typeof v === 'object' && 'value' in v) return this.toArrayValue(v.value);
    if (typeof v === 'string') return v.split(',').map(s => s.trim()).filter(Boolean);
    if (v == null || v === undefined) return [];
    return [String(v)];
  }

  // ルールに基づく説明的なエラーメッセージを構築
  buildRuleMessage(column, kind, payload = {}, when = [], row = {}) {
    const label = this.getFieldLabelByKey(column.key);
    const reason = this.formatWhenReason(when, row);
    let tail;
    switch (kind) {
      case 'stateEmpty':
        tail = `（${label}）が空欄である必要があります`;
        break;
      case 'stateNotEmpty':
        tail = `（${label}）に値が必要です`;
        break;
      case 'equals':
        tail = `（${label}）は「${payload.equals}」である必要があります`;
        break;
      case 'notEquals':
        tail = `（${label}）は「${payload.notEquals}」以外である必要があります`;
        break;
      case 'equalsAny':
        tail = `（${label}）で次のいずれかを選択してください: ${payload.equalsAny.join(', ')}`;
        break;
      case 'containsAll':
        tail = `（${label}）で次をすべて選択してください: ${payload.containsAll.join(', ')}`;
        break;
      default:
        tail = `（${label}）が不正です`;
    }
    return reason ? `${reason}、${tail}` : tail;
  }

  // when配列から理由文を生成
  formatWhenReason(when = [], row = {}) {
    if (!Array.isArray(when) || when.length === 0) return '';
    const parts = when.map(cond => {
      const label = this.getFieldLabelByKey(cond.fieldKey);
      const v = cond.value;
      switch (cond.operator) {
        case 'notEmpty':
          return `${label}が入力されているため`;
        case 'empty':
          return `${label}が空欄のため`;
        case 'equals':
          return `${label}が「${v}」のため`;
        case 'notEquals':
          return `${label}が「${v}」以外のため`;
        case 'equalsAny':
          return `${label}が「${Array.isArray(v) ? v.join(' / ') : v}」のいずれかのため`;
        default:
          return `${label}の条件に合致したため`;
      }
    });
    return parts.join('かつ');
  }

  // キーからカラムラベルを取得
  getFieldLabelByKey(fieldKey) {
    const col = CONFIG?.integratedTableConfig?.columns?.find(c => c.key === fieldKey);
    return col?.label || fieldKey;
  }

  // ===== 内部: UI反映 =====

  markInvalid(recordIndex, fieldKey, errors = []) {
    const recordId = window.virtualScroll?.getRecordId(recordIndex);
    if (!recordId) return;

    if (!this.invalidFields.has(recordId)) {
      this.invalidFields.set(recordId, new Set());
    }
    this.invalidFields.get(recordId).add(fieldKey);

    // メッセージを保存
    const message = Array.isArray(errors) && errors.length > 0 ? errors.join('、') : '不正な値です';
    if (!this.invalidFieldMessages.has(recordId)) {
      this.invalidFieldMessages.set(recordId, {});
    }
    const msgMap = this.invalidFieldMessages.get(recordId);
    msgMap[fieldKey] = message;

    // セルにスタイル適用
    const cell = document.querySelector(`td[data-record-index="${recordIndex}"][data-column="${fieldKey}"]`)
      || window.virtualScroll?.findCellElementByRecordId(recordId, fieldKey);
    if (cell) {
      cell.classList.add('cell-invalid');
      const col = CONFIG.integratedTableConfig.columns.find(c => c.key === fieldKey);
      const label = col ? col.label : fieldKey;
      const tooltip = `エラー（${label}）: ${message}`;
      cell.setAttribute('title', tooltip);
      const input = cell.querySelector('input, select');
      if (input) input.setAttribute('title', tooltip);
    }
  }

  clearInvalid(recordIndex, fieldKey) {
    const recordId = window.virtualScroll?.getRecordId(recordIndex);
    if (!recordId) return;
    if (this.invalidFields.has(recordId)) {
      this.invalidFields.get(recordId).delete(fieldKey);
    }
    if (this.invalidFieldMessages.has(recordId)) {
      const msgMap = this.invalidFieldMessages.get(recordId);
      delete msgMap[fieldKey];
      // 空になったら削除
      if (Object.keys(msgMap).length === 0) {
        this.invalidFieldMessages.delete(recordId);
      }
    }
    const cell = document.querySelector(`td[data-record-index="${recordIndex}"][data-column="${fieldKey}"]`)
      || window.virtualScroll?.findCellElementByRecordId(recordId, fieldKey);
    if (cell) {
      cell.classList.remove('cell-invalid');
      // 既に自動付与したtitleをクリア（他用途のtitleは残す）
      const col = CONFIG.integratedTableConfig.columns.find(c => c.key === fieldKey);
      const label = col ? col.label : fieldKey;
      const prefix = `エラー（${label}）:`;
      if ((cell.getAttribute('title') || '').startsWith(prefix)) {
        cell.removeAttribute('title');
      }
      const input = cell.querySelector('input, select');
      if (input && (input.getAttribute('title') || '').startsWith(prefix)) {
        input.removeAttribute('title');
      }
    }
  }

  /**
   * 再描画後のUI復元
   */
  restoreInvalidStylesUI() {
    setTimeout(() => {
      this.invalidFields.forEach((fieldSet, recordId) => {
        fieldSet.forEach(fieldKey => {
          const cell = window.virtualScroll?.findCellElementByRecordId(recordId, fieldKey);
          if (cell) {
            cell.classList.add('cell-invalid');
            // メッセージの復元（title）
            const msgMap = this.invalidFieldMessages.get(recordId);
            const message = msgMap && msgMap[fieldKey] ? msgMap[fieldKey] : null;
            if (message) {
              const col = CONFIG.integratedTableConfig.columns.find(c => c.key === fieldKey);
              const label = col ? col.label : fieldKey;
              const tooltip = `エラー（${label}）: ${message}`;
              cell.setAttribute('title', tooltip);
              const input = cell.querySelector('input, select');
              if (input) input.setAttribute('title', tooltip);
            }
          }
        });
      });
    }, 80);
  }

  // ===== ユーティリティ =====

  isEmpty(v) {
    return v === undefined || v === null || String(v).trim() === '' || v === '-';
  }

  isNumeric(v) {
    return /^-?\d+(?:\.\d+)?$/.test(String(v).trim());
  }

  showToast(message, type = 'info') {
    // TableRendererのトーストに合わせる
    if (window.tableRenderer && typeof window.tableRenderer.showToast === 'function') {
      window.tableRenderer.showToast(message, type);
    } else {
      alert(message);
    }
  }

  /**
   * バリデーション状態をクリア（新しい検索実行時に使用）
   */
  clearValidationState() {
    console.log('🧹 バリデーション状態をクリア中...');
    
    // エラーフィールドMapをクリア
    const invalidFieldsCount = this.invalidFields.size;
    const invalidMessagesCount = this.invalidFieldMessages.size;
    
    this.invalidFields.clear();
    this.invalidFieldMessages.clear();
    
    // UIからエラーハイライトを削除
    this.clearAllErrorHighlights();
    
    console.log(`✅ バリデーション状態クリア完了 (エラーフィールド: ${invalidFieldsCount}件, エラーメッセージ: ${invalidMessagesCount}件)`);
  }

  /**
   * 全てのエラーハイライトをUIから削除
   */
  clearAllErrorHighlights() {
    try {
      // cell-invalidクラスを持つ全ての要素からクラスを削除
      const invalidCells = document.querySelectorAll('.cell-invalid');
      invalidCells.forEach(cell => {
        cell.classList.remove('cell-invalid');
      });
      
      console.log(`🎨 エラーハイライト削除: ${invalidCells.length}個のセル`);
    } catch (error) {
      console.error('エラーハイライトクリア中にエラー:', error);
    }
  }
}

// グローバル公開
window.ValidationEngine = ValidationEngine;
// シングルトンとして利用
window.validation = new ValidationEngine();

