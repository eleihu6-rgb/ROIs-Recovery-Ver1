#include <gtest/gtest.h>

#include "RuleEngine/rule/framework/utils/TrainingCourseUtils.h"
#include "db/CrewDB.h"

#include <memory>
#include <string>
#include <vector>

namespace TrainingCourseUtilsTest::FindNearestProgramCourse {

// 测试 FindNearestProgramCourse 函数
TEST(FindNearestProgramTest, FindNearestProgramCourse) {
    // 创建当前课程
    std::shared_ptr<TmProgramCourse> currProgramCourse = std::make_shared<TmProgramCourse>();
    currProgramCourse->startTime = 100; 
    currProgramCourse->endTime = 200; 
    currProgramCourse->id = 1;

    // 创建课程列表
    std::vector<std::shared_ptr<TmProgramCourse>> programCourseList;
    std::shared_ptr<TmProgramCourse> tmpProgramCourse = std::make_shared<TmProgramCourse>();
    tmpProgramCourse->startTime = 300; 
    tmpProgramCourse->endTime = 400; 
    tmpProgramCourse->id = 2;
    programCourseList.emplace_back(tmpProgramCourse);

    tmpProgramCourse = std::make_shared<TmProgramCourse>();
    tmpProgramCourse->startTime = 250; 
    tmpProgramCourse->endTime = 251; 
    tmpProgramCourse->id = 3;
    programCourseList.emplace_back(tmpProgramCourse);

    auto a = TrainingCourseUtils::FindNearestProgramCourse(currProgramCourse, programCourseList);
    ASSERT_EQ(a->id, 3);
}

// 测试空列表情况
TEST(FindNearestProgramTest, FindNearestProgramCourseEmptyList) {
    std::shared_ptr<TmProgramCourse> currProgramCourse = std::make_shared<TmProgramCourse>();
    currProgramCourse->startTime = 100;
    currProgramCourse->endTime = 200;
    currProgramCourse->id = 1;

    std::vector<std::shared_ptr<TmProgramCourse>> programCourseList;

    auto a = TrainingCourseUtils::FindNearestProgramCourse(currProgramCourse, programCourseList);
    ASSERT_EQ(a, nullptr);
}

// 测试空当前课程情况
TEST(FindNearestProgramTest, FindNearestProgramCourseNullCurrent) {
    std::shared_ptr<TmProgramCourse> currProgramCourse = nullptr;

    std::vector<std::shared_ptr<TmProgramCourse>> programCourseList;
    std::shared_ptr<TmProgramCourse> tmpProgramCourse = std::make_shared<TmProgramCourse>();
    tmpProgramCourse->startTime = 300;
    tmpProgramCourse->endTime = 400;
    tmpProgramCourse->id = 2;
    programCourseList.emplace_back(tmpProgramCourse);

    auto a = TrainingCourseUtils::FindNearestProgramCourse(currProgramCourse, programCourseList);
    ASSERT_EQ(a, nullptr);
}

// 测试重叠时间的情况
TEST(FindNearestProgramTest, FindNearestProgramCourseOverlapping) {
    std::shared_ptr<TmProgramCourse> currProgramCourse = std::make_shared<TmProgramCourse>();
    currProgramCourse->startTime = 100;
    currProgramCourse->endTime = 200;
    currProgramCourse->id = 1;

    std::vector<std::shared_ptr<TmProgramCourse>> programCourseList;
    std::shared_ptr<TmProgramCourse> tmpProgramCourse = std::make_shared<TmProgramCourse>();
    tmpProgramCourse->startTime = 150;  // 与当前课程重叠
    tmpProgramCourse->endTime = 250;
    tmpProgramCourse->id = 2;
    programCourseList.emplace_back(tmpProgramCourse);

    tmpProgramCourse = std::make_shared<TmProgramCourse>();
    tmpProgramCourse->startTime = 300;  // 不重叠，但距离较近
    tmpProgramCourse->endTime = 400;
    tmpProgramCourse->id = 3;
    programCourseList.emplace_back(tmpProgramCourse);

    auto a = TrainingCourseUtils::FindNearestProgramCourse(currProgramCourse, programCourseList);
    ASSERT_EQ(a->id, 2);  // 应该返回重叠的课程，因为距离为0
}

// 测试多个课程中距离最近的情况
TEST(FindNearestProgramTest, FindNearestProgramCourseMultipleCourses) {
    std::shared_ptr<TmProgramCourse> currProgramCourse = std::make_shared<TmProgramCourse>();
    currProgramCourse->startTime = 100;
    currProgramCourse->endTime = 200;
    currProgramCourse->id = 1;

    std::vector<std::shared_ptr<TmProgramCourse>> programCourseList;
    std::shared_ptr<TmProgramCourse> tmpProgramCourse = std::make_shared<TmProgramCourse>();
    tmpProgramCourse->startTime = 500;  // 距离较远
    tmpProgramCourse->endTime = 600;
    tmpProgramCourse->id = 2;
    programCourseList.emplace_back(tmpProgramCourse);

    tmpProgramCourse = std::make_shared<TmProgramCourse>();
    tmpProgramCourse->startTime = 210;  // 距离较近 (10单位距离)
    tmpProgramCourse->endTime = 220;
    tmpProgramCourse->id = 3;
    programCourseList.emplace_back(tmpProgramCourse);

    tmpProgramCourse = std::make_shared<TmProgramCourse>();
    tmpProgramCourse->startTime = 400;  // 距离中等
    tmpProgramCourse->endTime = 500;
    tmpProgramCourse->id = 4;
    programCourseList.emplace_back(tmpProgramCourse);

    auto a = TrainingCourseUtils::FindNearestProgramCourse(currProgramCourse, programCourseList);
    ASSERT_EQ(a->id, 3);  // 应该返回距离最近的课程
}

TEST(FindNearestProgramTest, FindNearestProgramCourseEqualDistance2) {
    std::shared_ptr<TmProgramCourse> currProgramCourse = std::make_shared<TmProgramCourse>();
    currProgramCourse->startTime = 100;
    currProgramCourse->endTime = 200;
    currProgramCourse->id = 1;

    std::vector<std::shared_ptr<TmProgramCourse>> programCourseList;
    std::shared_ptr<TmProgramCourse> tmpProgramCourse = std::make_shared<TmProgramCourse>();
    tmpProgramCourse->startTime = 300;  // 距离为100 (300-200)
    tmpProgramCourse->endTime = 400;
    tmpProgramCourse->id = 2;
    programCourseList.emplace_back(tmpProgramCourse);

    tmpProgramCourse = std::make_shared<TmProgramCourse>();
    tmpProgramCourse->startTime = 0;
    tmpProgramCourse->endTime = 50; // 距离为50 (200-0, 实际上是100-0=100)
    tmpProgramCourse->id = 3;
    programCourseList.emplace_back(tmpProgramCourse);

    auto a = TrainingCourseUtils::FindNearestProgramCourse(currProgramCourse, programCourseList);
    // 由于两个课程距离相等，应该返回第一个遇到的课程，即id为2的课程
    ASSERT_EQ(a->id, 3);
}

// 测试相等距离时返回第一个遇到的课程
TEST(FindNearestProgramTest, FindNearestProgramCourseEqualDistance) {
    std::shared_ptr<TmProgramCourse> currProgramCourse = std::make_shared<TmProgramCourse>();
    currProgramCourse->startTime = 100;
    currProgramCourse->endTime = 250;
    currProgramCourse->id = 1;

    std::vector<std::shared_ptr<TmProgramCourse>> programCourseList;
    std::shared_ptr<TmProgramCourse> tmpProgramCourse = std::make_shared<TmProgramCourse>();
    tmpProgramCourse->startTime = 300;  // 距离为100 (300-200)
    tmpProgramCourse->endTime = 400;
    tmpProgramCourse->id = 2;
    programCourseList.emplace_back(tmpProgramCourse);

    tmpProgramCourse = std::make_shared<TmProgramCourse>();
    tmpProgramCourse->startTime = 0;    
    tmpProgramCourse->endTime = 50; // 距离为50 (100-50=50)
    tmpProgramCourse->id = 3;
    programCourseList.emplace_back(tmpProgramCourse);

    auto a = TrainingCourseUtils::FindNearestProgramCourse(currProgramCourse, programCourseList);
    // 由于两个课程距离相等，应该返回第一个遇到的课程，即id为2的课程
    ASSERT_EQ(a->id, 2);
}

}