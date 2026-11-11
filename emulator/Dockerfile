# AWS publishes no prebuilt AWS Emulator image, so build one from the LTS package.
# `uname -m` yields x86_64 or aarch64, which match the package names.
FROM public.ecr.aws/amazonlinux/amazonlinux:2023-minimal
ARG EMULATOR_VERSION=1.0.322
RUN rpm -i "https://downloads.aws.com/aws-emulator/packages/aws-emulator/LTS/aws-emulator-${EMULATOR_VERSION}-1-$(uname -m).rpm" \
    && mkdir -p /home/emulator/.aws/emulator && chown -R 1000 /home/emulator
USER 1000
ENV HOME=/home/emulator
EXPOSE 9297
ENTRYPOINT ["aws-emulator"]
CMD ["-b", "0.0.0.0", "-p", "9297", "--telemetry", "off"]
