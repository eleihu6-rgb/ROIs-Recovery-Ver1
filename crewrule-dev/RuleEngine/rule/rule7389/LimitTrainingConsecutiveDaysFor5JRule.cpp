/**
 * @file LimitTrainingConsecutiveDaysFor5JRule.cpp
 * @brief 7389法规规则类实现 - 课程连续X天之后要安排Y天休假
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2026-06-08
**/

#include <numeric>
#include <map>
#include <algorithm>
#include <set>
#include "../RuleSytem.h"
#include "LimitTrainingConsecutiveDaysFor5JRule.h"
#include "UtilFunc.h"
#include "Utility.h"
#include "../constant/Constants.h"
#include "../utils/TimeUtils.h"
#include "../utils/StringUtils.h"
#include "../utils/DutyUtils.h"
#include "../utils/RosterUtils.h"
#include "../utils/TrainingCourseUtils.h"
#include "../period/BaseActivityPeriod.h"
#include "AirportDefaultTmOffset.h"
#include "RuleParams.h"
#include "TimezoneUtils.h"
#include "index/TmCourseIndex.h"
#include "index/TmProgramIndex.h"
#include "index/TmPairingIndex.h"
#include "Log/Logger.h"

bool LimitTrainingConsecutiveDaysFor5JRule::CheckRule(const std::shared_ptr<CREW>& crew) const {
    if (this->_ruleParams.empty() || crew == nullptr) {
        return true;
    }

    std::vector<const ROSTER*> rosters;
    for (const auto& roster : crew->rosterList) {
        rosters.emplace_back(roster.get());
    }

    time_t checkedStartTime = 0, checkedEndTime = 0;
    if (this->_application == ROSTER_OPTIMIZER || rosters.empty()) {
        checkedStartTime = this->_dbData->scenario.startDtUTC;
        checkedEndTime = this->_dbData->scenario.endDtUTC + 24 * 3600;
    } else {
        checkedStartTime = rosters[0]->actStrUtc;
        checkedEndTime = rosters[rosters.size() - 1]->restStrUtc;
    }

    bool passAllRule = true;
    _ruleViolation.SetRuleParam(_ruleParams[0]);
    _ruleViolation.SetParam("crewId", crew->idCrew);

    int offsetTZMinutes = RosterUtils::GetTimeZoneOffset(checkedStartTime, crew, this->GetDataContext());

    auto activityPeriods = BaseActivityPeriod::GetActivityPeriodsOfSegment(rosters);

    //检查连续训练天数和休息要求
    if (!CheckConsecutiveCourseRest(activityPeriods, crew, offsetTZMinutes)) {
        passAllRule = false;
    }

    ////检查每日训练时长限制（按课程）
    //if (!CheckDailyHoursLimit(activityPeriods, crew, offsetTZMinutes)) {
    //    passAllRule = false;
    //}

    //检查每日训练时长限制（按Program的课程）
    const auto programCourseMap = TrainingCourseUtils::GetProgramCourseInProgram(crew, this->GetDataContext());
    for (auto& pair : programCourseMap) {
        auto& allProgramCourseList = pair.second;//Program中所有已排课的子课程列表
        if (!CheckDailyHoursLimit(allProgramCourseList, crew, offsetTZMinutes)) {
            passAllRule = false;
        }

    }

    return passAllRule;
}

bool LimitTrainingConsecutiveDaysFor5JRule::CheckConsecutiveCourseRest(const vector<shared_ptr<BaseActivityPeriod>>& activityPeriods, const std::shared_ptr<CREW>& crew, int offsetTZMinutes) const {
    bool valid = true;

    auto& tmProgramCourseIndex = this->_dbData->tmProgramCourseIndex;
    auto& tmProgramCoursePnrIndex = this->_dbData->tmProgramCoursePnrIndex;

	//std::shared_ptr<TmProgramCourse> prevProgramCourse = nullptr;//前一个相同课程的TmProgramCourse
    for (int i = 0; i < activityPeriods.size(); i++) {
        const auto& currPeriod = activityPeriods[i];

        if (this->IsRosterOptimizerModel() && currPeriod->GetRoster()->source == "PA") {
            continue;
        }

        if (currPeriod->GetRoster()->pairing == nullptr) {
            continue;
        }

        int totalConsecutiveDays = 0; //当前课程的连续天数
		int lastIndex = - 1;//最后连续课程的索引，用于计算后续连续休息日
        auto activity = currPeriod->GetActivity();
        if (typeid(*activity) == typeid(Segment)) {
            //如果是飞行，先检查该飞行是否关联了课程，如果关联了课程再进行连续天数计算
            auto segment = static_cast<Segment*>(activity);
            auto firstProgramCourse = tmProgramCourseIndex->getByRosterId(currPeriod->GetRoster()->rosterId, segment->getDBId());
            if (firstProgramCourse == nullptr) {
                continue;
            }
            auto tmCourse = TrainingCourseUtils::GetCourseByCourseId(firstProgramCourse->courseId, this->GetDataContext());
            if (tmCourse == nullptr) {
                continue;
            }

            auto tmProgramCoursePnr = tmProgramCoursePnrIndex->getByProgramCourseId(firstProgramCourse->parentId);
            if (tmProgramCoursePnr == nullptr || tmProgramCoursePnr->trainingDays <= 0 || tmProgramCoursePnr->restDays <= 0) {
                continue;
            }

            int adjustIndex = -1;
            totalConsecutiveDays = TrainingCourseUtils::GetConsecutiveDaysWithCurrProgramCourse(nullptr, firstProgramCourse, offsetTZMinutes);
			lastIndex = GetConsecutiveCourseLastIndex(adjustIndex, totalConsecutiveDays, activityPeriods, i, firstProgramCourse, tmProgramCoursePnr, offsetTZMinutes);
            if (adjustIndex > 0) {
                i = adjustIndex;
            }

            auto restDays = GetConsecutiveRestDay(lastIndex, activityPeriods, offsetTZMinutes);
            int actRestDays = std::get<0>(restDays);
            if (actRestDays < tmProgramCoursePnr->restDays) {
                valid = false;
                ThrowRuleViolationForConsecutiveCourse(currPeriod, activityPeriods[lastIndex], tmProgramCoursePnr, tmCourse, totalConsecutiveDays, restDays);
                if (!IsCheckAllRule()) {
                    return false;
                }
            }
        }
    }
    return valid;
}

bool LimitTrainingConsecutiveDaysFor5JRule::CheckDailyHoursLimit(const vector<shared_ptr<BaseActivityPeriod>>& activityPeriods, const std::shared_ptr<CREW>& crew, int offsetTZMinutes) const {
    bool valid = true;

    auto& tmProgramCourseIndex = this->_dbData->tmProgramCourseIndex;
    auto& tmProgramCoursePnrIndex = this->_dbData->tmProgramCoursePnrIndex;

    //按courseCode + date分组记录训练时长
    //key: courseCode, value: map<dateUtc, pair<duration(单位：秒), roster*(仅记录当天最后一个Roster)>>
    std::map<std::string, std::map<time_t, std::pair<int, const ROSTER*>>> courseDateHours;

    for (int i = 0; i < activityPeriods.size(); i++) {
        const auto& currPeriod = activityPeriods[i];

        if (this->IsRosterOptimizerModel() && currPeriod->GetRoster()->source == "PA") {
            continue;
        }

        if (currPeriod->GetRoster()->pairing == nullptr) {
            continue;
        }

        auto activity = currPeriod->GetActivity();
        if (typeid(*activity) == typeid(Segment)) {
            //如果是飞行，先检查该飞行是否关联了课程，如果关联了课程再进行连续天数计算
            auto segment = static_cast<Segment*>(activity);
            auto programCourse = tmProgramCourseIndex->getByRosterId(currPeriod->GetRoster()->rosterId, segment->getDBId());
            if (programCourse == nullptr) {
                continue;
            }
            auto tmCourse = TrainingCourseUtils::GetCourseByCourseId(programCourse->courseId, this->GetDataContext());
            if (tmCourse == nullptr || tmCourse->maxHoursPerDay <= 0) {
                continue;
            }

            auto tmProgramCoursePnr = tmProgramCoursePnrIndex->getByProgramCourseId(programCourse->parentId);
            if (tmProgramCoursePnr == nullptr) {
                continue;
            }

            time_t startDateUtc = Utility::GetInstancePtr()->getLocalDayStartInUTC(programCourse->startTime, offsetTZMinutes);
            time_t endDateUtc = Utility::GetInstancePtr()->getLocalDayStartInUTC(programCourse->endTime, offsetTZMinutes);

            //跨午夜课程按时长分配到各天
            time_t currentDate = startDateUtc;
            while (currentDate <= endDateUtc) {
                time_t currentDateStart = std::max(currentDate, programCourse->startTime);
                time_t currentDateEnd = std::min(currentDate + (time_t)24 * 3600, programCourse->endTime);
                int duration = static_cast<int>(currentDateEnd - currentDateStart);//单位：秒
                courseDateHours[tmCourse->courseCode][currentDate].first += duration;
                courseDateHours[tmCourse->courseCode][currentDate].second = currPeriod->GetRoster();
                currentDate += (time_t)24 * 3600;
            }
        }
       
    }

    //检查每个课程每天的时长限制
    for (const auto& courseEntry : courseDateHours) {
        const std::string& courseCode = courseEntry.first;
        const auto& dateHours = courseEntry.second;

        auto iterCourse = _dbData->tmCourseCodeMap.find(courseCode);
        if (iterCourse == _dbData->tmCourseCodeMap.end() || iterCourse->second == nullptr) {
            continue;
        }
        auto& tmCourse = iterCourse->second;
        if (tmCourse->maxHoursPerDay <= 0) {
            continue;
        }

        for (const auto& dateEntry : dateHours) {
            time_t dateUtc = dateEntry.first;
            int actualHours = dateEntry.second.first;//单位：秒
            const ROSTER* roster = dateEntry.second.second;

            if (actualHours > tmCourse->maxHoursPerDay * 3600) {
                ThrowRuleViolationForDailyHours(roster, tmCourse, dateUtc, actualHours);
                valid = false;

                if (!IsCheckAllRule()) {
                    return false;
                }
            }
        }
    }

    return valid;
}

bool LimitTrainingConsecutiveDaysFor5JRule::CheckDailyHoursLimit(const vector<std::shared_ptr<TmProgramCourse>>& tmProgramCourseList, const std::shared_ptr<CREW>& crew, int offsetTZMinutes) const {
    bool valid = true;

    auto& tmProgramCourseIndex = this->_dbData->tmProgramCourseIndex;
    auto& tmProgramCoursePnrIndex = this->_dbData->tmProgramCoursePnrIndex;


    auto programCourseMapWithParentId = TrainingCourseUtils::GetProgramCourseMapByParent(tmProgramCourseList);
    for (auto& pair : programCourseMapWithParentId) {
        auto& parentProgramCourseId = pair.first;
        auto& childProgramCourseList = pair.second;

        auto tmCourse = TrainingCourseUtils::GetCourseByCourseId(tmProgramCourseList.front()->courseId, this->GetDataContext());
        if (tmCourse == nullptr) {
            continue;
        }

        auto tmProgramCoursePnr = tmProgramCoursePnrIndex->getByProgramCourseId(parentProgramCourseId);
        if (tmProgramCoursePnr == nullptr || tmProgramCoursePnr->maxHoursPerDay <= 0) {
            continue;
        }

        //按courseCode + date分组记录训练时长
        //key: courseCode, value: map<dateUtc, pair<duration(单位：秒), rosterId(仅记录当天最后一个rosterId)>>
        std::map<std::string, std::map<time_t, std::pair<int, long long>>> courseDateHours;

        for (int i = 0; i < childProgramCourseList.size(); i++) {
            const auto& childProgramCourse = childProgramCourseList[i];

            time_t startDateUtc = Utility::GetInstancePtr()->getLocalDayStartInUTC(childProgramCourse->startTime, offsetTZMinutes);
            time_t endDateUtc = Utility::GetInstancePtr()->getLocalDayStartInUTC(childProgramCourse->endTime, offsetTZMinutes);

            //跨午夜课程按时长分配到各天
            time_t currentDate = startDateUtc;
            while (currentDate <= endDateUtc) {
                time_t currentDateStart = std::max(currentDate, childProgramCourse->startTime);
                time_t currentDateEnd = std::min(currentDate + (time_t)24 * 3600, childProgramCourse->endTime);
                int duration = static_cast<int>(currentDateEnd - currentDateStart);//单位：秒
                courseDateHours[tmCourse->courseCode][currentDate].first += duration;
                courseDateHours[tmCourse->courseCode][currentDate].second = childProgramCourse->rosterId;
                currentDate += (time_t)24 * 3600;
            }
        }


        //检查每个课程每天的时长限制
        for (const auto& courseEntry : courseDateHours) {
            const std::string& courseCode = courseEntry.first;
            const auto& dateHours = courseEntry.second;

            auto iterCourse = _dbData->tmCourseCodeMap.find(courseCode);
            if (iterCourse == _dbData->tmCourseCodeMap.end() || iterCourse->second == nullptr) {
                continue;
            }
            auto& tmCourse = iterCourse->second;
            if (tmProgramCoursePnr->maxHoursPerDay <= 0) {
                continue;
            }

            for (const auto& dateEntry : dateHours) {
                time_t dateUtc = dateEntry.first;
                int actualHours = dateEntry.second.first;//单位：秒
                int rosterId = dateEntry.second.second;

                if (actualHours > tmProgramCoursePnr->maxHoursPerDay * 3600) {
                    ThrowRuleViolationForDailyHours(rosterId, tmProgramCoursePnr, tmCourse, dateUtc, actualHours);
                    valid = false;

                    if (!IsCheckAllRule()) {
                        return false;
                    }
                }
            }
        }

    }


    return valid;
}

int LimitTrainingConsecutiveDaysFor5JRule::GetConsecutiveCourseLastIndex(int& adjustIndex, int& totalConsecutiveDays, const vector<shared_ptr<BaseActivityPeriod>>& activityPeriods, const int currIndex,
    const std::shared_ptr<TmProgramCourse>& firstProgramCourse, const std::shared_ptr<TmProgramCoursePnr>& currProgramCoursePnr, const int offsetTZMinutes) const {

    int lastIndex = currIndex;
	adjustIndex = currIndex;
    if (totalConsecutiveDays >= currProgramCoursePnr->trainingDays) {
        return lastIndex;
    }

	bool firstConsecutive = true;//标识当前课程与第一个(开始)课程是否是相同课程，若中间发生课程变化则设置为false
	std::shared_ptr<TmProgramCourse> prevProgramCourse = firstProgramCourse;//前一个相同课程的TmProgramCourse
    for (int i = currIndex + 1; i < activityPeriods.size(); i++) {
        const auto& currPeriod = activityPeriods[i];
        auto currActivity = currPeriod->GetActivity();

        if (prevProgramCourse != nullptr && (int)(currActivity->getStartTimeUtcAct() - prevProgramCourse->endTime) > 48 * 3600) {
            //当前任务与前一个课程时间超过2天，则退出
            return lastIndex;
        }

        if (typeid(*currActivity) == typeid(Segment)) {
            auto currSegment = static_cast<Segment*>(currActivity);
            auto currProgramCourse = this->_dbData->tmProgramCourseIndex->getByRosterId(currPeriod->GetRoster()->rosterId, currSegment->getDBId());
            if (currProgramCourse == nullptr || currProgramCourse->programId != firstProgramCourse->programId) {
                continue;
            }

            if (currProgramCourse->courseId == firstProgramCourse->courseId) {
                if (firstConsecutive) {
                    adjustIndex = i;
                }

                //前后同一节课程，计算连续天数
                int consecutiveDays = TrainingCourseUtils::GetConsecutiveDaysWithCurrProgramCourse(prevProgramCourse, currProgramCourse, offsetTZMinutes);
                if (consecutiveDays >= 0) {
                    lastIndex = i;
                    totalConsecutiveDays += consecutiveDays;
                }
                else {
                    return lastIndex;
                }

                if (totalConsecutiveDays >= currProgramCoursePnr->trainingDays) {
                    return i;
                }
                prevProgramCourse = currProgramCourse;
                
            }
            else {
                firstConsecutive = false;
            }
            
        }
    }
	return lastIndex;
}

std::tuple<int, time_t, time_t> LimitTrainingConsecutiveDaysFor5JRule::GetConsecutiveRestDay(const int currIndex, const vector<shared_ptr<BaseActivityPeriod>>& activityPeriods, const int offsetTZMinutes) const {
    if (currIndex < 0 || currIndex >= activityPeriods.size()) {
        return std::make_tuple(0, 0, 0);
    }
    time_t restStartTimeUtc = activityPeriods[currIndex]->GetActivity()->getEndTimeUtcAct();
    time_t restEndTimeUtc = -1;
    for (int i = currIndex + 1; i < activityPeriods.size(); i++) {
        const auto& currPeriod = activityPeriods[i];
        auto currActivity = currPeriod->GetActivity();
        if (typeid(*currActivity) == typeid(ROSTER)) {
            ROSTER* roster = (ROSTER*)currActivity;
            if (RuleParams::GetInstancePtr()->isRestAssignment(roster->qualifier, roster->duty)) {
                restEndTimeUtc = roster->getRestStartUtcAct();
            }
            else {
                restEndTimeUtc = roster->getStartTimeUtcAct();
                break;
            }
        }
        else {
            restEndTimeUtc = currActivity->getStartTimeUtcAct();
            break;
        }
    }
    if (restEndTimeUtc < 0) {
        restEndTimeUtc = this->_dbData->scenario.endDtUTC;
    }
    int restDays = TimeUtils::CalculateFullDaysBetweenTimes(restStartTimeUtc, restEndTimeUtc, offsetTZMinutes);
    return std::make_tuple(restDays, restStartTimeUtc, restEndTimeUtc);
}

void LimitTrainingConsecutiveDaysFor5JRule::ThrowRuleViolationForConsecutiveCourse(const shared_ptr<BaseActivityPeriod>& startPeriod, const shared_ptr<BaseActivityPeriod>& endPeriod, const std::shared_ptr<TmProgramCoursePnr>& tmProgramCoursePnr, const std::shared_ptr<TmCourse>& tmCourse, const int totalConsecutiveDays, const std::tuple<int, time_t, time_t>& restDays) const {
    //课程【{courseCode}】已连续安排 {N} 天训练，未满足需连续休息 {M} 天的要求
    std::string msg = "Course ({0:courseCode}) has been scheduled for ({1:trainingDays}) consecutive days without required ({2:restDays}) days of rest.";
    msg = StringUtils::Format(msg, tmCourse->courseCode, tmProgramCoursePnr->trainingDays, tmProgramCoursePnr->restDays);

    SharedPtr<CREW> ppCrew = this->_dbData->crewList[_ruleViolation.GetRuleLegality()->crewIndex];
    _ruleViolation.SetLegalityMessage(ppCrew, msg);
    _ruleViolation.GetRuleLegality()->isLegal = false;
    _ruleViolation.GetRuleLegality()->skipCheckInLaterIterations = true;

    RULE_VIOLATION* rv = new RULE_VIOLATION();
    rv->crewId = ppCrew->idCrew;
    rv->rosterId = startPeriod->GetRoster()->rosterId;
    rv->pairingId = startPeriod->GetRoster()->pairId;
    if (typeid(*(startPeriod->GetActivity())) == typeid(Segment)) {
        auto segment = (Segment*)startPeriod->GetActivity();
        rv->dutySequenceNumber = segment->getDutySeq();
        rv->segmentId = segment->getDBId();
    }

    rv->startDTUtc = startPeriod->GetStartTimeUtc();
    rv->endDTUtc = endPeriod->GetEndTimeUtc();
    rv->violation_msg = msg;
    rv->type = VIOLATION_TYPE::CREW_VIOLATION;
    rv->operation_result.insert(std::pair<std::string, std::string>("courseCode", tmCourse->courseCode));
    rv->operation_result.insert(std::pair<std::string, std::string>("trainingDays", std::to_string(tmProgramCoursePnr->trainingDays)));
    rv->operation_result.insert(std::pair<std::string, std::string>("restDays", std::to_string(tmProgramCoursePnr->restDays)));
    rv->operation_result.insert(std::pair<std::string, std::string>("actConsecutiveDays", std::to_string(totalConsecutiveDays)));

    _ruleViolation.AddRuleViolations(rv);
}

void LimitTrainingConsecutiveDaysFor5JRule::ThrowRuleViolationForDailyHours(const ROSTER* roster, const std::shared_ptr<TmCourse>& tmCourse, const time_t dateUtc, const int actualHours) const {
    //课程【{courseCode}】在【{date}】的训练时长 {actualHours} 超出每日最大限制 {maxHours}
    std::string msg = "Course ({0:courseCode}) duration ({1:actualHours}) exceed the maximum allowed ({2:maxHoursPerDay}).";
    msg = StringUtils::Format(msg, tmCourse->courseCode, TimeUtils::MinutesTohhmm(actualHours / 60), TimeUtils::MinutesTohhmm(tmCourse->maxHoursPerDay * 60));

    SharedPtr<CREW> ppCrew = this->_dbData->crewList[_ruleViolation.GetRuleLegality()->crewIndex];
    _ruleViolation.SetLegalityMessage(ppCrew, msg);
    _ruleViolation.GetRuleLegality()->isLegal = false;
    _ruleViolation.GetRuleLegality()->skipCheckInLaterIterations = true;

    RULE_VIOLATION* rv = new RULE_VIOLATION();
    rv->crewId = ppCrew->idCrew;
    rv->rosterId = roster->rosterId;
    rv->startDTUtc = dateUtc;
    rv->endDTUtc = dateUtc + (time_t)24 * 3600;
    rv->violation_msg = msg;
    rv->type = VIOLATION_TYPE::CREW_VIOLATION;
    rv->operation_result.insert(std::pair<std::string, std::string>("courseCode", tmCourse->courseCode));
    rv->operation_result.insert(std::pair<std::string, std::string>("maxHoursPerDay", TimeUtils::MinutesTohhmm(tmCourse->maxHoursPerDay * 60)));
    rv->operation_result.insert(std::pair<std::string, std::string>("actualHours", TimeUtils::MinutesTohhmm(actualHours/60)));
    _ruleViolation.AddRuleViolations(rv);
}


void LimitTrainingConsecutiveDaysFor5JRule::ThrowRuleViolationForDailyHours(const long long rosterId, const std::shared_ptr<TmProgramCoursePnr>& tmProgramCoursePnr, const std::shared_ptr<TmCourse>& tmCourse, const time_t dateUtc, const int actualHours) const {
    //课程【{courseCode}】在【{date}】的训练时长 {actualHours} 超出每日最大限制 {maxHours}
    std::string msg = "Course ({0:courseCode}) duration ({1:actualHours}) exceed the maximum allowed ({2:maxHoursPerDay}).";
    msg = StringUtils::Format(msg, tmCourse->courseCode, TimeUtils::MinutesTohhmm(actualHours / 60), TimeUtils::MinutesTohhmm(tmProgramCoursePnr->maxHoursPerDay * 60));

    SharedPtr<CREW> ppCrew = this->_dbData->crewList[_ruleViolation.GetRuleLegality()->crewIndex];
    _ruleViolation.SetLegalityMessage(ppCrew, msg);
    _ruleViolation.GetRuleLegality()->isLegal = false;
    _ruleViolation.GetRuleLegality()->skipCheckInLaterIterations = true;

    RULE_VIOLATION* rv = new RULE_VIOLATION();
    rv->crewId = ppCrew->idCrew;
    rv->rosterId = rosterId;
    rv->startDTUtc = dateUtc;
    rv->endDTUtc = dateUtc + (time_t)24 * 3600;
    rv->violation_msg = msg;
    rv->type = VIOLATION_TYPE::CREW_VIOLATION;
    rv->operation_result.insert(std::pair<std::string, std::string>("courseCode", tmCourse->courseCode));
    rv->operation_result.insert(std::pair<std::string, std::string>("maxHoursPerDay", TimeUtils::MinutesTohhmm(tmProgramCoursePnr->maxHoursPerDay * 60)));
    rv->operation_result.insert(std::pair<std::string, std::string>("actualHours", TimeUtils::MinutesTohhmm(actualHours / 60)));
    _ruleViolation.AddRuleViolations(rv);
}

void LimitTrainingConsecutiveDaysFor5JRule::ParseParam(const InputType& input) {
    for (const auto& dbRule : input.dbRules) {
        _ruleParams.emplace_back(TrainingConsecutiveDaysFor5JRuleParam(this));
        auto& newParam = _ruleParams.back();
        newParam.ParseParam(dbRule);
    }
    if (!_ruleParams.empty()) {
        return;
    }
    for (const auto& singleRuleParamString : input.ruleParamString) {
        _ruleParams.emplace_back(TrainingConsecutiveDaysFor5JRuleParam(this));
        auto& newParam = _ruleParams.back();
        newParam.ParseParam(singleRuleParamString);
    }
}