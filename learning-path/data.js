// data.js
const learningData = {
  // 基础路径
  basePaths: {
    beginner: [
      { id: 'b1', title: 'Programming Fundamentals', desc: 'Learn basic logic, variables, and control flow.' },
      { id: 'b2', title: 'First Mini-Project', desc: 'Build a simple console application to practice syntax.' },
      { id: 'b3', title: 'Version Control Basics', desc: 'Understand Git and GitHub for saving your work.' }
    ],
    student: [
      { id: 's1', title: 'Data Structures & Algorithms', desc: 'Strengthen your problem-solving skills for technical screens.' },
      { id: 's2', title: 'Object-Oriented Design', desc: 'Learn to structure larger applications cleanly.' },
      { id: 's3', title: 'Collaborative Workflows', desc: 'Practice branching, merging, and code reviews.' }
    ],
    graduate: [
      { id: 'g1', title: 'System Design Basics', desc: 'Understand how to architect scalable applications.' },
      { id: 'g2', title: 'Mock Interviews', desc: 'Practice algorithmic coding under time constraints.' },
      { id: 'g3', title: 'Resume & Portfolio Polish', desc: 'Highlight your best projects for recruiters.' }
    ]
  },

  goalModifiers: {
    internship: 'Focus on algorithmic efficiency and data structures.',
    build: 'Focus on prompt engineering and integrating AI APIs.'
  },

  options: {
    badHabits: [
      { id: 'copy-paste', label: 'Copy-pasting redundant code' },
      { id: 'hardcode', label: 'Hardcoding configuration/values' },
      { id: 'no-comments', label: 'Missing comments for complex logic' },
      { id: 'raw-throw', label: 'Throwing raw exceptions without context' }
    ]
  },

  // 扩充后的题库，包含难度标识
  questionBank: [
    // === Easy (基础语法与逻辑) ===
    {
      id: 'q1', difficulty: 'easy',
      question: 'Code runs without errors. Is it necessarily correct?',
      options: [
        { text: 'Yes, if it compiles it works.', score: 0 },
        { text: 'No, it might have logical flaws.', score: 1 },
        { text: 'Only in statically typed languages.', score: 0 }
      ]
    },
    {
      id: 'q2', difficulty: 'easy',
      question: 'What is the primary purpose of a loop?',
      options: [
        { text: 'To execute a block of code repeatedly.', score: 1 },
        { text: 'To define a new variable.', score: 0 },
        { text: 'To handle exceptions.', score: 0 }
      ]
    },
    {
      id: 'q3', difficulty: 'easy',
      question: 'Which of these is a variable declaration?',
      options: [
        { text: 'let x = 10;', score: 1 },
        { text: 'if (x == 10)', score: 0 },
        { text: 'function x() {}', score: 0 }
      ]
    },
    {
      id: 'q4', difficulty: 'easy',
      question: 'What does DRY stand for in software engineering?',
      options: [
        { text: 'Don\'t Repeat Yourself', score: 1 },
        { text: 'Do Run Yesterday', score: 0 },
        { text: 'Data Read Yield', score: 0 }
      ]
    },
    {
      id: 'q5', difficulty: 'easy',
      question: 'What is a common sign of an infinite loop?',
      options: [
        { text: 'The program exits immediately.', score: 0 },
        { text: 'The condition never evaluates to false.', score: 1 },
        { text: 'The loop variable is incremented correctly.', score: 0 }
      ]
    },

    // === Medium (调试、Git、代码规范) ===
    {
      id: 'q6', difficulty: 'medium',
      question: 'You find a potential bug in a loop. What is your first step?',
      options: [
        { text: 'Rewrite the whole function.', score: 0 },
        { text: 'Add a print statement to check variables.', score: 1 },
        { text: 'Ignore it if the loop eventually ends.', score: 0 }
      ]
    },
    {
      id: 'q7', difficulty: 'medium',
      question: 'What is the primary purpose of a Git branch?',
      options: [
        { text: 'To duplicate the codebase for backup.', score: 0 },
        { text: 'To isolate work without affecting the main codebase.', score: 1 },
        { text: 'To compile the code faster.', score: 0 }
      ]
    },
    {
      id: 'q8', difficulty: 'medium',
      question: 'When should you write a comment?',
      options: [
        { text: 'For every single line of code.', score: 0 },
        { text: 'To explain *why* the code does something, not *what*.', score: 1 },
        { text: 'Only when the teacher requires it.', score: 0 }
      ]
    },
    {
      id: 'q9', difficulty: 'medium',
      question: 'What is a good practice when handling API errors?',
      options: [
        { text: 'Silently ignore the error.', score: 0 },
        { text: 'Catch the error and log a meaningful message.', score: 1 },
        { text: 'Let the app crash so the user knows.', score: 0 }
      ]
    },
    {
      id: 'q10', difficulty: 'medium',
      question: 'What does a Code Review primarily aim to do?',
      options: [
        { text: 'Find syntax errors that the compiler missed.', score: 0 },
        { text: 'Improve code quality, share knowledge, and catch logic flaws.', score: 1 },
        { text: 'Check if the developer worked enough hours.', score: 0 }
      ]
    },

    // === Hard (技术债、架构、异常设计) ===
    {
      id: 'q11', difficulty: 'hard',
      question: 'What is a common sign of high technical debt?',
      options: [
        { text: 'Using modern design patterns.', score: 0 },
        { text: 'Copy-pasting the same logic in 5 different files.', score: 1 },
        { text: 'Having a comprehensive test suite.', score: 0 }
      ]
    },
    {
      id: 'q12', difficulty: 'hard',
      question: 'Why is throwing raw exceptions (e.g., `throw new Error()`) everywhere considered bad?',
      options: [
        { text: 'It consumes too much memory.', score: 0 },
        { text: 'It lacks context for upstream callers to handle specific error types.', score: 1 },
        { text: 'It breaks the compiler.', score: 0 }
      ]
    },
    {
      id: 'q13', difficulty: 'hard',
      question: 'What is the main benefit of Dependency Injection?',
      options: [
        { text: 'It makes the code run faster.', score: 0 },
        { text: 'It decouples components, making testing and refactoring easier.', score: 1 },
        { text: 'It writes documentation automatically.', score: 0 }
      ]
    },
    {
      id: 'q14', difficulty: 'hard',
      question: 'When refactoring a legacy system, what should you do first?',
      options: [
        { text: 'Delete all the old code and start fresh.', score: 0 },
        { text: 'Write unit tests to capture existing behavior before changing.', score: 1 },
        { text: 'Rewrite the UI.', score: 0 }
      ]
    },
    {
      id: 'q15', difficulty: 'hard',
      question: 'What is a "smell" in the context of software code?',
      options: [
        { text: 'A syntax error flagged by linter.', score: 0 },
        { text: 'A surface indication that usually corresponds to a deeper problem.', score: 1 },
        { text: 'A comment that is too long.', score: 0 }
      ]
    }
  ],

  advancedCourses: {
    aiVideoGeneration: {
      sora: { title: 'Generating Code Walkthroughs with Sora', desc: 'Use text-to-video AI to create dynamic code explanation videos.' },
      runway: { title: 'Cinematic Tutorials with Runway', desc: 'Produce high-quality video tutorials using Runway Gen-2.' },
      pika: { title: 'Rapid Prototyping Educational Content', desc: 'Quickly generate short-form educational videos for complex concepts.' }
    },
    refactoring: {
      'copy-paste': { title: 'DRY Principle in Practice', desc: 'Refactor a duplicated logic block into reusable utilities.' },
      'hardcode': { title: 'Configuration Management', desc: 'Extract hardcoded values into environment variables.' },
      'no-comments': { title: 'Clean Code & Documentation', desc: 'Learn when and how to write effective comments.' },
      'raw-throw': { title: 'Custom Exception Handling', desc: 'Design meaningful error classes for better debugging.' }
    }
  }
};