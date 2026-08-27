#include "TestHttpController.h"

#include <iostream>
#include "oatpp/web/client/HttpRequestExecutor.hpp"
#include "oatpp-test/web/ClientServerTestRunner.hpp"
#include "oatpp-test/UnitTest.hpp"
#include "oatpp/core/base/Environment.hpp"

#include "configParam.h"

#include "../HttpController.h"
#include "TestComponent.h"
#include "TestHttpClient.h"

#include "Log/Logger.h"
#include <cstdio>

void TestHttpController::onRun() {

    /* Remove test database file before running the test */
    //OATPP_LOGI(TAG, "DB-File='%s'", TESTDATABASE_FILE);
    //std::remove(TESTDATABASE_FILE);

    /* Register test components */
    TestComponent component;

    /* Create client-server test runner */
    oatpp::test::web::ClientServerTestRunner runner;

    /* Add HttpController endpoints to the router of the test server */
    runner.addController(HttpController::createShared());

    /* Run test */
    runner.run([this, &runner] {

        /* Get client connection provider for Api Client */
        OATPP_COMPONENT(std::shared_ptr<oatpp::network::ClientConnectionProvider>, clientConnectionProvider);

        /* Get object mapper component */
        OATPP_COMPONENT(std::shared_ptr<oatpp::data::mapping::ObjectMapper>, objectMapper);

        /* Create http request executor for Api Client */
        auto requestExecutor = oatpp::web::client::HttpRequestExecutor::createShared(clientConnectionProvider);

        /* Create Test API client */
        auto client = TestHttpClient::createShared(requestExecutor, objectMapper);


        /* Assert that user has been added */
        auto newResponse = client->test();

        OATPP_ASSERT(newResponse->getStatusCode() == 200);


        }, std::chrono::minutes(10) /* test timeout */);

    /* wait all server threads finished */
    std::this_thread::sleep_for(std::chrono::seconds(1));

}

int runTests(const char* szRootPath) {
    memset(g_rootDir, 0, sizeof(g_rootDir));
    strncpy(g_rootDir, szRootPath, strlen(szRootPath) + 1);
    oatpp::base::Environment::init();

    OATPP_RUN_TEST(TestHttpController);

    /* Print how much objects were created during app running, and what have left-probably leaked */
    /* Disable object counting for release builds using '-D OATPP_DISABLE_ENV_OBJECT_COUNTERS' flag for better performance */
    std::cout << "\nEnvironment:\n";
    std::cout << "objectsCount = " << oatpp::base::Environment::getObjectsCount() << "\n";
    std::cout << "objectsCreated = " << oatpp::base::Environment::getObjectsCreated() << "\n\n";

    OATPP_ASSERT(oatpp::base::Environment::getObjectsCount() == 0);

    oatpp::base::Environment::destroy();
    return 0;
}