#include <gtest/gtest.h>

#include "RuleEngine/rule/framework/utils/RosterUtils.h"
#include "RuleEngine/rule/framework/utils/DutyUtils.h"
#include "db/RuleParams.h"
#include "orUtil/UtilFunc.h"
#include "orUtil/TimeZoneUtil/TimezoneUtils.h"

#include <memory>
#include <string>
#include <utility>
#include <vector>

namespace RosterUtilsTest::GetActualEntryTimes {


    class TestGetActualEntryTimes : public ::testing::Test {
    protected:
        void SetUp() override {}

        void TearDown() override {}
    };

    // 测试空航段列表的情况
    TEST_F(TestGetActualEntryTimes, TestNoSegments) {
        vector<Segment*> segments;
        vector<string> airportAreas = { "CGY", "BXU" };

        int result = RosterUtils::GetActualEntryTimes(segments, airportAreas);
        EXPECT_EQ(result, 0);
    }

    // 测试空机场区域列表的情况
    TEST_F(TestGetActualEntryTimes, TestEmptyAirportAreas) {
        // 创建真实的Segment对象
        Segment* seg1 = new Segment();
        seg1->setDepStation("PEK");
        seg1->setArrStation("CGY");
        vector<Segment*> segments = { seg1 };
        vector<string> airportAreas = {};  // 空的目标区域列表

        int result = RosterUtils::GetActualEntryTimes(segments, airportAreas);
        EXPECT_EQ(result, 0);

        delete seg1;
    }

    // 测试单个航段进入目标区域的情况
    TEST_F(TestGetActualEntryTimes, TestSingleSegmentIntoArea) {
        Segment* seg1 = new Segment();
        seg1->setDepStation("PEK");  // 非目标区域
        seg1->setArrStation("CGY");  // 目标区域
        vector<Segment*> segments = { seg1 };
        vector<string> airportAreas = { "CGY", "BXU" };

        int result = RosterUtils::GetActualEntryTimes(segments, airportAreas);
        // 从非目标区域进入目标区域，应计为1次进入
        EXPECT_EQ(result, 1);

        delete seg1;
    }

    // 测试单个航段在目标区域内移动的情况
    TEST_F(TestGetActualEntryTimes, TestSingleSegmentWithinArea) {
        Segment* seg1 = new Segment();
        seg1->setDepStation("CGY");  // 目标区域
        seg1->setArrStation("BXU");  // 目标区域
        vector<Segment*> segments = { seg1 };
        vector<string> airportAreas = { "CGY", "BXU" };

        int result = RosterUtils::GetActualEntryTimes(segments, airportAreas);
        // 从一个目标区域机场到另一个目标区域机场算进入
        EXPECT_EQ(result, 1);

        delete seg1;
    }

    // 测试单个航段未进入目标区域的情况
    TEST_F(TestGetActualEntryTimes, TestSingleSegmentOutsideArea) {
        Segment* seg1 = new Segment();
        seg1->setDepStation("PEK");  // 非目标区域
        seg1->setArrStation("SHA");  // 非目标区域
        vector<Segment*> segments = { seg1 };
        vector<string> airportAreas = { "CGY", "BXU" };

        int result = RosterUtils::GetActualEntryTimes(segments, airportAreas);
        EXPECT_EQ(result, 0);

        delete seg1;
    }

    // 测试多个航段无进入的情况
    TEST_F(TestGetActualEntryTimes, TestMultipleSegmentsNoEntry) {
        Segment* seg1 = new Segment();
        Segment* seg2 = new Segment();
        Segment* seg3 = new Segment();

        seg1->setDepStation("PEK");
        seg1->setArrStation("SHA");
        seg2->setDepStation("SHA");
        seg2->setArrStation("CAN");
        seg3->setDepStation("CAN");
        seg3->setArrStation("SZX");

        vector<Segment*> segments = { seg1, seg2, seg3 };
        vector<string> airportAreas = { "CGY", "BXU" };

        int result = RosterUtils::GetActualEntryTimes(segments, airportAreas);
        EXPECT_EQ(result, 0);

        delete seg1;
        delete seg2;
        delete seg3;
    }

    // 测试多个航段有一次进入的情况
    TEST_F(TestGetActualEntryTimes, TestMultipleSegmentsOneEntry) {
        Segment* seg1 = new Segment();
        Segment* seg2 = new Segment();
        Segment* seg3 = new Segment();

        seg1->setDepStation("PEK");
        seg1->setArrStation("SHA");
        seg2->setDepStation("SHA");
        seg2->setArrStation("CGY");  // 进入目标区域
        seg3->setDepStation("CGY");
        seg3->setArrStation("BXU");  // 在目标区域内移动

        vector<Segment*> segments = { seg1, seg2, seg3 };
        vector<string> airportAreas = { "CGY", "BXU" };

        int result = RosterUtils::GetActualEntryTimes(segments, airportAreas);
        EXPECT_EQ(result, 1);

        delete seg1;
        delete seg2;
        delete seg3;
    }

    // 测试多个航段有多次进入的情况
    TEST_F(TestGetActualEntryTimes, TestMultipleSegmentsMultipleEntries) {
        Segment* seg1 = new Segment();
        Segment* seg2 = new Segment();
        Segment* seg3 = new Segment();
        Segment* seg4 = new Segment();

        seg1->setDepStation("PEK");   // 非目标区域
        seg1->setArrStation("SHA");   // 非目标区域
        seg2->setDepStation("SHA");   // 非目标区域
        seg2->setArrStation("CGY");   // 进入目标区域 - 第1次
        seg3->setDepStation("CGY");   // 目标区域
        seg3->setArrStation("CAN");   // 非目标区域 - 离开
        seg4->setDepStation("CAN");   // 非目标区域
        seg4->setArrStation("BXU");   // 进入目标区域 - 第2次

        vector<Segment*> segments = { seg1, seg2, seg3, seg4 };
        vector<string> airportAreas = { "CGY", "BXU" };

        int result = RosterUtils::GetActualEntryTimes(segments, airportAreas);
        EXPECT_EQ(result, 2);

        delete seg1;
        delete seg2;
        delete seg3;
        delete seg4;
    }

    // 测试往返运动多次进入的情况
    TEST_F(TestGetActualEntryTimes, TestBackAndForthMovement) {
        Segment* seg1 = new Segment();
        Segment* seg2 = new Segment();
        Segment* seg3 = new Segment();
        Segment* seg4 = new Segment();
        Segment* seg5 = new Segment();

        seg1->setDepStation("PEK");   // 非目标区域
        seg1->setArrStation("CGY");   // 进入目标区域 - 第1次
        seg2->setDepStation("CGY");   // 目标区域
        seg2->setArrStation("SHA");   // 非目标区域 - 离开
        seg3->setDepStation("SHA");   // 非目标区域
        seg3->setArrStation("BXU");   // 进入目标区域 - 第2次
        seg4->setDepStation("BXU");   // 目标区域
        seg4->setArrStation("SZX");   // 非目标区域 - 离开
        seg5->setDepStation("SZX");   // 非目标区域
        seg5->setArrStation("CGY");   // 进入目标区域 - 第3次

        vector<Segment*> segments = { seg1, seg2, seg3, seg4, seg5 };
        vector<string> airportAreas = { "CGY", "BXU" };

        int result = RosterUtils::GetActualEntryTimes(segments, airportAreas);
        EXPECT_EQ(result, 3);

        delete seg1;
        delete seg2;
        delete seg3;
        delete seg4;
        delete seg5;
    }

    // 测试以目标区域作为起点的情况
    TEST_F(TestGetActualEntryTimes, TestStartingInTargetArea) {
        // 假设初始位置就在目标区域内
        Segment* seg1 = new Segment();
        Segment* seg2 = new Segment();
        Segment* seg3 = new Segment();

        seg1->setDepStation("CGY");   // 起始就在目标区域
        seg1->setArrStation("BXU");   // 在目标区域内移动
        seg2->setDepStation("BXU");   // 目标区域
        seg2->setArrStation("PEK");   // 离开目标区域
        seg3->setDepStation("PEK");   // 非目标区域
        seg3->setArrStation("CGY");   // 进入目标区域 - 第1次

        vector<Segment*> segments = { seg1, seg2, seg3 };
        vector<string> airportAreas = { "CGY", "BXU" };

        int result = RosterUtils::GetActualEntryTimes(segments, airportAreas);
        // 因为起始位置已经在目标区域内也计入1次，所以只有最后一次进入才算作进入
        EXPECT_EQ(result, 2);

        delete seg1;
        delete seg2;
        delete seg3;
    }
}