# setup_database.py
"""
数据库初始化和管理脚本
"""
import os
from app import app, db, MusicTask, CallbackLog
from datetime import datetime, timedelta

def init_database():
    """初始化数据库"""
    with app.app_context():
        # 删除所有表（谨慎使用）
        # db.drop_all()
        
        # 创建所有表
        db.create_all()
        print("Database tables created successfully!")

def clear_old_tasks(days=30):
    """清理旧任务数据"""
    with app.app_context():
        cutoff_date = datetime.utcnow() - timedelta(days=days)
        
        # 删除旧的已完成或失败的任务
        old_tasks = MusicTask.query.filter(
            MusicTask.created_at < cutoff_date,
            MusicTask.status.in_(['completed', 'failed'])
        ).all()
        
        for task in old_tasks:
            # 删除相关的回调日志
            CallbackLog.query.filter_by(task_id=task.id).delete()
            # 删除任务
            db.session.delete(task)
        
        db.session.commit()
        print(f"Cleaned up {len(old_tasks)} old tasks")

def get_database_stats():
    """获取数据库统计信息"""
    with app.app_context():
        stats = {
            'total_tasks': MusicTask.query.count(),
            'pending_tasks': MusicTask.query.filter_by(status='pending').count(),
            'analyzing_tasks': MusicTask.query.filter_by(status='analyzing').count(),
            'generating_tasks': MusicTask.query.filter_by(status='generating').count(),
            'completed_tasks': MusicTask.query.filter_by(status='completed').count(),
            'failed_tasks': MusicTask.query.filter_by(status='failed').count(),
            'total_callbacks': CallbackLog.query.count()
        }
        
        # 最近24小时的任务数
        last_24h = datetime.utcnow() - timedelta(hours=24)
        stats['tasks_last_24h'] = MusicTask.query.filter(
            MusicTask.created_at >= last_24h
        ).count()
        
        return stats

def reset_stuck_tasks():
    """重置卡住的任务"""
    with app.app_context():
        # 找到超过1小时还在处理中的任务
        timeout = datetime.utcnow() - timedelta(hours=1)
        stuck_tasks = MusicTask.query.filter(
            MusicTask.status.in_(['analyzing', 'generating']),
            MusicTask.updated_at < timeout
        ).all()
        
        for task in stuck_tasks:
            task.status = 'failed'
            task.error_message = 'Task timeout - reset by system'
            task.updated_at = datetime.utcnow()
        
        db.session.commit()
        print(f"Reset {len(stuck_tasks)} stuck tasks")

if __name__ == '__main__':
    import sys
    
    if len(sys.argv) < 2:
        print("Usage: python setup_database.py [init|stats|cleanup|reset]")
        sys.exit(1)
    
    command = sys.argv[1]
    
    if command == 'init':
        init_database()
    elif command == 'stats':
        stats = get_database_stats()
        print("Database Statistics:")
        for key, value in stats.items():
            print(f"  {key}: {value}")
    elif command == 'cleanup':
        days = int(sys.argv[2]) if len(sys.argv) > 2 else 30
        clear_old_tasks(days)
    elif command == 'reset':
        reset_stuck_tasks()
    else:
        print("Unknown command. Available commands: init, stats, cleanup, reset")