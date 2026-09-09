FROM maven:3.9.9-eclipse-temurin-21 AS build
WORKDIR /workspace

COPY pom.xml .
RUN mvn -q dependency:go-offline

COPY src ./src
RUN mvn -q package

FROM eclipse-temurin:21-jre
WORKDIR /app

RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*

COPY --from=build /workspace/target/*.jar /app/report-artifact-service.jar

EXPOSE 9091
ENV ARTIFACTS_ROOT=/app/artifacts

ENTRYPOINT ["java", "-cp", "/app/report-artifact-service.jar", "service.ReportArtifactService"]

