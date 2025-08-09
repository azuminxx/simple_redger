/**
 * バリデーションエンジン
 * - 保存時、セル編集時、セル交換/分離時に使用
 * - ルールは最小限（必須、数値）から開始。将来的に追加可能
 */
class ValidationEngine {
  constructor() {
    // レコードID（統合キー）→ 不正フィールドSet
    this.invalidFields = new Map();
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
        this.markInvalid(recordIndex, fieldKey);
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
          this.markInvalid(recordIndex, column.key);
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
      this.showToast('未入力または不正な値があります。ハイライトされたセルを修正してください。', 'error');
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
            errors.push('空欄である必要があります');
          } else if (state === 'notEmpty' && this.isEmpty(current)) {
            errors.push('値が必要です');
          }

          // 値比較系（equals / notEquals / equalsAny / containsAll）
          if (Object.prototype.hasOwnProperty.call(requirement, 'equals')) {
            if (String(current ?? '') !== String(requirement.equals ?? '')) {
              errors.push(`値は「${requirement.equals}」である必要があります`);
            }
          }
          if (Object.prototype.hasOwnProperty.call(requirement, 'notEquals')) {
            if (String(current ?? '') === String(requirement.notEquals ?? '')) {
              errors.push(`値は「${requirement.notEquals}」以外である必要があります`);
            }
          }
          if (Array.isArray(requirement.equalsAny)) {
            const ok = requirement.equalsAny.some(x => curArr.includes(String(x)));
            if (!ok) {
              errors.push(`次のいずれかを選択してください: ${requirement.equalsAny.join(', ')}`);
            }
          }
          if (Array.isArray(requirement.containsAll)) {
            const missing = requirement.containsAll.filter(x => !curArr.includes(String(x)));
            if (missing.length > 0) {
              errors.push(`次をすべて選択してください: ${requirement.containsAll.join(', ')}`);
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

  // ===== 内部: UI反映 =====

  markInvalid(recordIndex, fieldKey) {
    const recordId = window.virtualScroll?.getRecordId(recordIndex);
    if (!recordId) return;

    if (!this.invalidFields.has(recordId)) {
      this.invalidFields.set(recordId, new Set());
    }
    this.invalidFields.get(recordId).add(fieldKey);

    // セルにスタイル適用
    const cell = document.querySelector(`td[data-record-index="${recordIndex}"][data-column="${fieldKey}"]`)
      || window.virtualScroll?.findCellElementByRecordId(recordId, fieldKey);
    if (cell) cell.classList.add('cell-invalid');
  }

  clearInvalid(recordIndex, fieldKey) {
    const recordId = window.virtualScroll?.getRecordId(recordIndex);
    if (!recordId) return;
    if (this.invalidFields.has(recordId)) {
      this.invalidFields.get(recordId).delete(fieldKey);
    }
    const cell = document.querySelector(`td[data-record-index="${recordIndex}"][data-column="${fieldKey}"]`)
      || window.virtualScroll?.findCellElementByRecordId(recordId, fieldKey);
    if (cell) cell.classList.remove('cell-invalid');
  }

  /**
   * 再描画後のUI復元
   */
  restoreInvalidStylesUI() {
    setTimeout(() => {
      this.invalidFields.forEach((fieldSet, recordId) => {
        fieldSet.forEach(fieldKey => {
          const cell = window.virtualScroll?.findCellElementByRecordId(recordId, fieldKey);
          if (cell) cell.classList.add('cell-invalid');
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
}

// グローバル公開
window.ValidationEngine = ValidationEngine;
// シングルトンとして利用
window.validation = new ValidationEngine();

