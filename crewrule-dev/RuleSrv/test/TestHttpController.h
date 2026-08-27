#ifndef _TESTHTTPCONTROLLER_H_
#define _TESTHTTPCONTROLLER_H_

#include "oatpp-test/UnitTest.hpp"

class TestHttpController : public oatpp::test::UnitTest {
public:
    TestHttpController() : oatpp::test::UnitTest("TEST[TestHttpController]")
    {}

    void onRun() override;
};

#endif //_TESTHTTPCONTROLLER_H_