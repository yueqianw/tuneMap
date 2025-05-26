# Dockerfile

# 1. 基于官方 Python 3.10 精简镜像
FROM python:3.10-slim

# 2. 安装系统依赖
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      build-essential \
      ffmpeg \
      libsndfile1 \
      git && \
    rm -rf /var/lib/apt/lists/*

# 3. 设置工作目录
WORKDIR /app

# 4. 复制并安装 Python 依赖
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 5. 复制应用代码
COPY api.py music_generate.py ./

# 6. 环境变量 & 暴露端口
ENV PORT=8080
EXPOSE 8080

# 7. 启动命令：预加载模型，1 个 worker + 4 线程
CMD ["gunicorn","-b","0.0.0.0:8080","api:app","--preload","--workers","1","--threads","4"]
