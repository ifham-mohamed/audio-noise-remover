# Build a single-thread, LGPL-only ffmpeg.wasm core. Keep this image independent
# of the app checkout so Docker never receives user media or local model files.
FROM emscripten/emsdk:3.1.40 AS build

ARG FFMPEG_WASM_COMMIT=f876f907c7e9b9bf51d4ed0b913a855a63ae63fc
ARG FFMPEG_VERSION=n5.1.4
ENV FFMPEG_VERSION=${FFMPEG_VERSION}
ENV FFMPEG_ST=1
ENV INSTALL_DIR=/opt
ENV CFLAGS="-O3 -I/opt/include"
ENV CXXFLAGS="-O3 -I/opt/include"
ENV LDFLAGS="-O3 -L/opt/lib -sEXPORT_ES6=1 -sENVIRONMENT=worker -sALLOW_MEMORY_GROWTH=1"

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates git pkg-config autoconf automake libtool ragel \
    && rm -rf /var/lib/apt/lists/*

RUN git init /opt/ffmpeg-wasm \
    && git -C /opt/ffmpeg-wasm remote add origin https://github.com/ffmpegwasm/ffmpeg.wasm.git \
    && git -C /opt/ffmpeg-wasm fetch --depth 1 origin ${FFMPEG_WASM_COMMIT} \
    && git -C /opt/ffmpeg-wasm checkout --detach FETCH_HEAD

RUN git init /src/ffmpeg \
    && git -C /src/ffmpeg remote add origin https://github.com/FFmpeg/FFmpeg.git \
    && git -C /src/ffmpeg fetch --depth 1 origin ${FFMPEG_VERSION} \
    && git -C /src/ffmpeg checkout --detach FETCH_HEAD

WORKDIR /src/ffmpeg
RUN mkdir -p src \
    && cp -R /opt/ffmpeg-wasm/src/bind src/bind \
    && cp -R /opt/ffmpeg-wasm/src/fftools src/fftools \
    && bash /opt/ffmpeg-wasm/build/ffmpeg.sh \
      --disable-everything \
      --enable-avcodec --enable-avformat --enable-avutil --enable-swresample \
      --enable-demuxer=wav,mp3,flac,mov,matroska \
      --enable-decoder=pcm_s16le,pcm_s24le,pcm_s32le,pcm_f32le,pcm_f64le,mp3,aac,flac,alac,opus,vorbis \
      --enable-parser=aac,mp3,flac,opus,vorbis,h264 \
      --enable-protocol=file,pipe \
      --disable-network \
      --enable-muxer=wav,f32le \
      --enable-encoder=pcm_f32le,pcm_s24le \
      --enable-filter=aresample,atrim,asetpts,anull,abuffer,abuffersink,abuffersrc,aformat \
      --enable-small

RUN sed -i 's/-lpostproc//g' /opt/ffmpeg-wasm/build/ffmpeg-wasm.sh \
    && mkdir -p dist/esm \
    && bash /opt/ffmpeg-wasm/build/ffmpeg-wasm.sh -o dist/esm/ffmpeg-core.js \
    && git -C /src/ffmpeg archive --format=tar.gz --output=/tmp/ffmpeg-n5.1.4-source.tar.gz HEAD \
    && tar -czf /tmp/ffmpeg-wasm-bindings-source.tar.gz -C /opt/ffmpeg-wasm src/bind src/fftools build/ffmpeg-wasm.sh build/ffmpeg.sh

FROM scratch AS artifacts
COPY --from=build /src/ffmpeg/dist/esm/ffmpeg-core.js /ffmpeg-core.js
COPY --from=build /src/ffmpeg/dist/esm/ffmpeg-core.wasm /ffmpeg-core.wasm
COPY --from=build /src/ffmpeg/LICENSE.md /source/LICENSE.md
COPY --from=build /opt/ffmpeg-wasm/LICENSE /source/ffmpeg-wasm-LICENSE
COPY --from=build /tmp/ffmpeg-n5.1.4-source.tar.gz /source/ffmpeg-n5.1.4-source.tar.gz
COPY --from=build /tmp/ffmpeg-wasm-bindings-source.tar.gz /source/ffmpeg-wasm-bindings-source.tar.gz
