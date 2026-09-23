FROM maven:3.9.9-eclipse-temurin-21 AS build
WORKDIR /workspace

COPY pom.xml .
RUN mvn -q -DskipTests dependency:go-offline

COPY src ./src
RUN mvn -q -DskipTests package

FROM eclipse-temurin:21-jre
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

RUN mkdir -p /app/srs-files

COPY --from=build /workspace/target/*.jar /app/testcase-generator-backend.jar

EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app/testcase-generator-backend.jar"]
