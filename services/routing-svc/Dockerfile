# syntax=docker/dockerfile:1.7
FROM eclipse-temurin:21-jdk-alpine AS build
WORKDIR /src
COPY . .
RUN mvn -q -DskipTests package || ./mvnw -q -DskipTests package

FROM eclipse-temurin:21-jre-alpine
WORKDIR /app
COPY --from=build /src/target/routing-svc-*.jar /app/app.jar
EXPOSE 8083
ENTRYPOINT ["java","-XX:+UseZGC","-XX:MaxRAMPercentage=75","-jar","/app/app.jar"]
