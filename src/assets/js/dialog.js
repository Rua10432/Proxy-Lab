export class M3MessageBox {
  constructor() {
    this.container = null;
  }

  /**
   * 显示弹窗并返回 Promise
   * @param {Object} opts - { title, content, confirmText, cancelText, isAlert }
   * @returns {Promise<boolean>}
   */
  show(opts = {}) {
    const {
      title = '确认',
      content = '您确定要执行此操作吗？',
      confirmText = '确认',
      cancelText = '取消',
      icon = '',
      isAlert = false
    } = opts;

    return new Promise((resolve) => {
      // 清理旧容器
      if (this.container) this.close();

      this.container = document.createElement('div');
      this.container.className = 'm3-dialog-overlay';

      // 修复了原代码中的重复 ID 问题，并将 dynamic-id 作为主要标识
      this.container.innerHTML = `
                        <div class="m3-dialog">
                            ${icon ? `<div class="m3-dialog-icon"><md-icon>${icon}</md-icon></div>` : ''}
                            <div class="m3-dialog-title" id="dynamic-dialog-title">${title}</div>
                            <div class="m3-dialog-content" id="dynamic-dialog-content">${content}</div>
                            <div class="m3-dialog-actions">
                                ${!isAlert ? `<button class="m3-text-button" id="dynamic-dialog-cancel">${cancelText}</button>` : ''}
                                <button class="m3-text-button" id="dynamic-dialog-confirm">${confirmText}</button>
                            </div>
                        </div>
                    `;

      document.body.appendChild(this.container);

      // 动画激活动作
      requestAnimationFrame(() => this.container.classList.add('active'));

      // 绑定事件
      const confirmBtn = this.container.querySelector('#dynamic-dialog-confirm');
      const cancelBtn = this.container.querySelector('#dynamic-dialog-cancel');

      confirmBtn.onclick = () => {
        this.close();
        resolve(true);
      };

      if (cancelBtn) {
        cancelBtn.onclick = () => {
          this.close();
          resolve(false);
        };
      }

      // 点击背景默认取消
      this.container.onclick = (e) => {
        if (e.target === this.container) {
          this.close();
          resolve(false);
        }
      };
    });
  }

  /**
   * 关闭并清理 DOM
   */
  close() {
    if (!this.container) return;
    const target = this.container;
    target.classList.remove('active');
    target.addEventListener('transitionend', () => {
      if (target.parentNode) {
        target.parentNode.removeChild(target);
      }
    }, { once: true });
    this.container = null;
  }
}


const m3Dialog = new M3MessageBox();

export async function showM3Dialog(opts = {}) {
  // If user passed strings (old way), handle it
  if (typeof opts === 'string') {
    const [title, content, confirmText, cancelText] = arguments;
    return await m3Dialog.show({ title, content, confirmText, cancelText });
  }
  
  return await m3Dialog.show(opts);
}
