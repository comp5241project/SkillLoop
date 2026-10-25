// script.js

const STORAGE_KEY = 'skillloop_learning_path_data_v10'; // 版本号升级

let selectedQuestions = []; 

document.addEventListener('DOMContentLoaded', () => {
  initApp();
});

function initApp() {
  const quizModal = document.getElementById('sl-quiz-modal');
  const welcomeCard = document.getElementById('sl-welcome-card');
  const personalCard = document.getElementById('sl-personal-card');
  const pathCard = document.getElementById('sl-path-card');
  
  const bgSelect = document.getElementById('sl-background');
  const goalSelect = document.getElementById('sl-goal');
  const aiModelSelect = document.getElementById('sl-ai-model');
  const habitsSection = document.getElementById('sl-habits-section');
  const skillCheckBanner = document.getElementById('sl-skill-check-banner');
  const skillCheckText = document.getElementById('sl-skill-check-text');
  
  let quizScore = null;

  renderCheckboxes('bad-habits-list', learningData.options.badHabits);

  // 1. 显隐 Habits 区块
  function toggleHabitsSection() {
    if (bgSelect.value === 'beginner') {
      habitsSection.style.display = 'none';
      document.querySelectorAll('#bad-habits-list input').forEach(cb => cb.checked = false);
    } else {
      habitsSection.style.display = 'block';
    }
  }
  bgSelect.addEventListener('change', toggleHabitsSection);
  toggleHabitsSection();

  // 2. 弹窗交互：点击 "Start Test"
  document.getElementById('btn-modal-start').addEventListener('click', () => {
    quizModal.style.display = 'none'; // 隐藏弹窗
    welcomeCard.style.display = 'block'; // 显示测试题
    generateRandomQuiz(); // 生成题目
  });

  // 3. 弹窗交互：点击 "Skip for now"
  document.getElementById('btn-modal-skip').addEventListener('click', () => {
    quizModal.style.display = 'none'; // 隐藏弹窗
    quizScore = null;
    
    skillCheckText.textContent = "You skipped the quick check. Your path will be based solely on your selections.";
    skillCheckBanner.style.display = 'block';
    
    personalCard.style.display = 'block'; // 直接显示主问卷
  });

  // 4. 提交测试题
  document.getElementById('btn-submit-quiz').addEventListener('click', () => {
    const form = document.getElementById('sl-quiz-form');
    const checkedInputs = form.querySelectorAll('input[type="radio"]:checked');
    if (checkedInputs.length < 5) {
      alert("Please answer all 5 questions.");
      return;
    }

    let totalScore = 0;
    checkedInputs.forEach(input => totalScore += parseInt(input.value));
    quizScore = totalScore;

    let resultText = '';
    if (totalScore <= 2) resultText = "You are just getting started. We recommend foundational courses.";
    else if (totalScore <= 4) resultText = "You have solid basics, but need to watch out for technical debt.";
    else resultText = "Excellent! You have a strong engineering mindset. We will focus on advanced architecture.";

    skillCheckText.textContent = `Quick Check Result (Score: ${quizScore}/5): ${resultText}`;
    skillCheckBanner.style.display = 'block';

    welcomeCard.style.display = 'none'; // 隐藏测试题
    personalCard.style.display = 'block'; // 显示主问卷
  });

  // 5. 生成最终路径
  document.getElementById('sl-make-path').addEventListener('click', () => {
    const isBeginner = bgSelect.value === 'beginner';
    const data = {
      background: bgSelect.value,
      goal: goalSelect.value,
      aiModel: aiModelSelect.value,
      quizScore: quizScore,
      habits: isBeginner ? [] : getCheckedValues('bad-habits-list')
    };
    saveAndRender(data);
  });

  // 6. Retake 重置
  document.getElementById('sl-reset-path').addEventListener('click', () => {
    localStorage.removeItem(STORAGE_KEY);
    pathCard.style.display = 'none';
    personalCard.style.display = 'none';
    welcomeCard.style.display = 'none';
    
    // 重置所有表单和状态
    document.getElementById('sl-quiz-form').reset();
    bgSelect.selectedIndex = 0;
    goalSelect.selectedIndex = 0;
    aiModelSelect.selectedIndex = 0;
    toggleHabitsSection();
    skillCheckBanner.style.display = 'none';
    quizScore = null;
    
    // 重新显示弹窗
    quizModal.style.display = 'flex'; 
  });

  // 7. 页面加载恢复状态
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    const data = JSON.parse(saved);
    quizScore = data.quizScore !== undefined ? data.quizScore : null;
    
    bgSelect.value = data.background || 'beginner';
    goalSelect.value = data.goal || 'internship';
    aiModelSelect.value = data.aiModel || 'sora';
    toggleHabitsSection();
    
    if (bgSelect.value !== 'beginner' && data.habits) {
      data.habits.forEach(h => {
        const cb = document.querySelector(`#bad-habits-list input[value="${h}"]`);
        if(cb) cb.checked = true;
      });
    }
    
    // 如果已有记录，直接渲染结果（不弹窗）
    quizModal.style.display = 'none';
    renderPath(data);
  } else {
    // 如果是全新用户，显示弹窗
    quizModal.style.display = 'flex';
  }
}

// --- 逻辑：随机抽题 ---
function generateRandomQuiz() {
  const easy = learningData.questionBank.filter(q => q.difficulty === 'easy');
  const medium = learningData.questionBank.filter(q => q.difficulty === 'medium');
  const hard = learningData.questionBank.filter(q => q.difficulty === 'hard');

  const shuffle = (array) => array.sort(() => Math.random() - 0.5);

  const selectedEasy = shuffle(easy).slice(0, 2);
  const selectedMedium = shuffle(medium).slice(0, 2);
  const selectedHard = shuffle(hard).slice(0, 1);

  selectedQuestions = shuffle([...selectedEasy, ...selectedMedium, ...selectedHard]);

  renderQuiz();
}

function renderQuiz() {
  const container = document.getElementById('sl-quiz-questions');
  container.innerHTML = '';
  
  selectedQuestions.forEach((q, index) => {
    const qDiv = document.createElement('div');
    qDiv.style.marginBottom = '20px';
    qDiv.innerHTML = `<p style="font-weight: 500; margin-bottom: 8px;">${index + 1}. ${q.question}</p>`;
    
    q.options.forEach((opt, optIdx) => {
      const label = document.createElement('label');
      label.className = 'sl-checkbox-item';
      label.style.padding = '10px';
      label.style.border = '1px solid #e2e8f0';
      label.style.borderRadius = '6px';
      label.style.marginBottom = '8px';
      label.style.display = 'flex';
      label.style.cursor = 'pointer';
      label.innerHTML = `
        <input type="radio" name="quiz_${q.id}" value="${opt.score}" style="margin-right: 10px;">
        ${opt.text}
      `;
      qDiv.appendChild(label);
    });
    container.appendChild(qDiv);
  });
}

// --- 其他辅助函数 ---
function renderCheckboxes(containerId, options) {
  const container = document.getElementById(containerId);
  container.innerHTML = options.map(opt => `
    <label class="sl-checkbox-item">
      <input type="checkbox" value="${opt.id}">
      ${opt.label}
    </label>
  `).join('');
}

function getCheckedValues(containerId) {
  const checkboxes = document.querySelectorAll(`#${containerId} input:checked`);
  return Array.from(checkboxes).map(cb => cb.value);
}

function saveAndRender(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  renderPath(data);
}

function renderPath(data) {
  document.getElementById('sl-welcome-card').style.display = 'none';
  document.getElementById('sl-personal-card').style.display = 'none';
  document.getElementById('sl-path-card').style.display = 'block';
  
  const list = document.getElementById('sl-path-list');
  const titleText = document.getElementById('sl-path-title');
  
  list.innerHTML = '';
  let courses = [];

  const base = learningData.basePaths[data.background] || learningData.basePaths['beginner'];
  base.forEach(c => courses.push({ ...c, tag: 'Core' }));

  const aiVideoCourse = learningData.advancedCourses.aiVideoGeneration[data.aiModel];
  if (aiVideoCourse) courses.push({ ...aiVideoCourse, tag: 'AI Video' });

  if (data.habits && data.habits.length > 0) {
    data.habits.forEach(habit => {
      const refactorCourse = learningData.advancedCourses.refactoring[habit];
      if (refactorCourse) courses.push({ ...refactorCourse, tag: 'Refactoring' });
    });
  }

  if (data.quizScore !== null && data.quizScore !== undefined) {
    if (data.quizScore <= 2) {
      courses.push({ title: 'Debugging Fundamentals', desc: 'Learn how to trace variable states and read stack traces.', tag: 'Skill Check' });
    } else if (data.quizScore >= 4) {
      courses.push({ title: 'Advanced Code Review', desc: 'Master architectural refactoring and design patterns.', tag: 'Skill Check' });
    }
  }

  if (courses.length === 0) {
    list.innerHTML = '<p class="sl-small">No issues detected. Keep up the good work!</p>';
  } else {
    courses.forEach((course, index) => {
      const el = document.createElement('div');
      el.className = 'sl-path-item';
      el.innerHTML = `
        <h4>
          ${index + 1}. ${course.title}
          <span class="sl-badge">${course.tag}</span>
        </h4>
        <p>${course.desc}</p>
      `;
      list.appendChild(el);
    });
  }

  titleText.innerHTML = `<strong>Goal tip:</strong> ${learningData.goalModifiers[data.goal] || ''}`;

  if (window.lucide) window.lucide.createIcons();
}