FROM maven:3.9.9-eclipse-temurin-21 AS build
WORKDIR /workspace

COPY pom.xml .
RUN mvn -q -DskipTests dependency:go-offline

COPY src ./src
RUN mvn -q -DskipTests package

FROM eclipse-temurin:21-jre
WORKDIR /app

RUN apt-get update && apt-get install -y curl git && rm -rf /var/lib/apt/lists/*

RUN mkdir -p /app/logs /app/artifacts/reports /app/artifacts/screenshots

COPY --from=build /workspace/target/*.jar /app/automation-portal-backend.jar

EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app/automation-portal-backend.jar"]
