FROM amazonlinux:latest

ENV NODE_VERSION 6.10.3
ENV NVM_DIR=/usr/local/nvm

RUN curl -o- https://raw.githubusercontent.com/creationix/nvm/v0.33.6/install.sh | bash \
  && . $NVM_DIR/nvm.sh \
  && nvm install $NODE_VERSION\
  && nvm alias default $NODE_VERSION \
  && nvm use default \
  && yum install -y gcc-c++ zip

ENV NODE_PATH $NVM_DIR/v$NODE_VERSION/lib/node_modules
ENV PATH $NVM_DIR/versions/node/v$NODE_VERSION/bin:$PATH

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm install

COPY lib ./lib/
COPY index.js ./

RUN zip -r "package.zip" * > /dev/null
