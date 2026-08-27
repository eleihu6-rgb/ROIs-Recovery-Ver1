/**
 * @file LimitCourseDurationForEvaFdRule.cpp
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#include <numeric>
#include "../RuleSytem.h"
#include "LimitCourseDurationForEvaFdRule.h"
#include "UtilFunc.h"
#include "Utility.h"
#include "../constant/Constants.h"
#include "../utils/TimeUtils.h"
#include "../utils/StringUtils.h"
#include "../utils/DutyUtils.h"
#include "../utils/RosterUtils.h"
#include "../utils/TrainingCourseUtils.h"
#include "AirportDefaultTmOffset.h"
#include "RuleParams.h"
#include "TimezoneUtils.h"
#include "index/TmCourseIndex.h"
#include "index/TmProgramIndex.h"
#include "index/TmPairingIndex.h"
#include "Log/Logger.h"
#include "utils/CompetenceValidationUtils.h"
#include <algorithm>

bool LimitCourseDurationForEvaFdRule::CheckRule(const std::shared_ptr<CREW>& crew) const {
	if (this->_ruleParams.empty() || crew == nullptr) {
		return true;
	}

	std::vector<const ROSTER*> rosters;
	for (SharedPtr<ROSTER> roster : crew->rosterList) {
		rosters.emplace_back(roster.get());
	}

	time_t checkedStartTime = 0, checkedEndTime = 0;
	if (this->_application == ROSTER_OPTIMIZER || rosters.empty())
	{
		checkedStartTime = this->_dbData->scenario.startDtUTC;
		checkedEndTime = this->_dbData->scenario.endDtUTC + 24 * 3600;
	}
	else
	{
		checkedStartTime = rosters[0]->actStrUtc;
		checkedEndTime = rosters[rosters.size() - 1]->restStrUtc;
	}

	bool passAllRule = true;
	bool next = true;
	_ruleViolation.SetRuleParam(_ruleParams[0]);
	_ruleViolation.SetParam("crewId", crew->idCrew);

	int offsetTZMinutes = RosterUtils::GetTimeZoneOffset(checkedStartTime, crew, this->GetDataContext());

	//按program分组，获得已排课的programCourse。返回值：map<programId, 培训计划program下已经排课的programCourse>
	map<long long, vector<std::shared_ptr<TmProgramCourse>>> programCourseMap = TrainingCourseUtils::GetProgramCourseInProgram(crew, this->GetDataContext());
	for (auto& pair : programCourseMap) {
		auto& programId = pair.first;
		auto& tmProgramCourseList = pair.second;

		auto tmProgram = this->_dbData->tmProgramIndex->getById(programId);
		if (tmProgram != nullptr && tmProgram->isSoloCourse()) {
			continue;
		}

		bool valid = CheckRule(programId, tmProgramCourseList, crew, offsetTZMinutes);
		if (!valid) {
			passAllRule = false;
		}
	}

	return passAllRule;
}

bool LimitCourseDurationForEvaFdRule::CheckRule(const long long programId, const vector<std::shared_ptr<TmProgramCourse>>& tmProgramCourseList, const std::shared_ptr<CREW>& crew, const int offsetTZMinutes) const {
	bool valid = true;
 	auto programCourseMapWithParentId = TrainingCourseUtils::GetProgramCourseMapByParent(tmProgramCourseList);
	for (auto& pair : programCourseMapWithParentId) {
		auto& parentProgramCourseId = pair.first;
		auto& childProgramCourseList = pair.second;
		
		auto parentProgramCourse = _dbData->tmProgramCourseIndex->getById(parentProgramCourseId);
		if (parentProgramCourse == nullptr) {
			continue;
		}

		auto tmCourse = TrainingCourseUtils::GetCourseByCourseId(parentProgramCourse->courseId, this->GetDataContext());
		if (tmCourse == nullptr) {
			Logger::getRuleLogger()->error("[LimitCourseDurationForEvaFdRule::CheckRule] TmCourse is null.courseId={}", parentProgramCourse->courseId);
			continue;
		}

		if (IgnoreCourse(tmCourse)) {
			continue;
		}

		auto [actualDurationMinute, actualLegNum] = GetActualDurationAndLegNumOfProgramCourse(tmCourse, childProgramCourseList, offsetTZMinutes);
		if (actualDurationMinute == -1 && actualLegNum == -1) {
			Logger::getRuleLogger()->error("[LimitCourseDurationForEvaFdRule::CheckRule] TmCourse.courseType error.courseType={}", tmCourse->courseType);
			continue;
		}

		if (!CheckRule(actualDurationMinute, actualLegNum, parentProgramCourse, childProgramCourseList, tmCourse, crew)) {
			valid = false;
			if (!IsCheckAllRule()) {
				return valid;
			}
		}
	}
	return valid;
}

std::tuple<int, int> LimitCourseDurationForEvaFdRule::GetActualDurationAndLegNumOfProgramCourse(const std::shared_ptr<TmCourse>& tmCourse, const vector<std::shared_ptr<TmProgramCourse>>& childProgramCourseList, const int offsetTZMinutes) const {
	int actualDurationMinute = -1, actualLegNum = -1;
	if (tmCourse->courseType == CourseType::LINE) {
		actualLegNum = (int)childProgramCourseList.size();
	}
	else {
		actualDurationMinute = 0;
		for (auto& childProgramCourse : childProgramCourseList) {
			int duration = TrainingCourseUtils::GetSIMOrGNDProgramCourseDuration(childProgramCourse, tmCourse, offsetTZMinutes, this->_dbData);
			//int duration = static_cast<int>(childProgramCourse->endTime - childProgramCourse->startTime) / 60;
			//if (tmCourse->courseType == CourseType::GROUND) {
			//	//需要扣除[12:30,13:30]之间休息时长
			//	static int restStartHHmm = TimeUtils::hhmmToMinutes("12:30");
			//	static int endStartHHmm = TimeUtils::hhmmToMinutes("13:30");
			//	duration = TimeUtils::GetDuration(childProgramCourse->startTime + (time_t)offsetTZMinutes * 60, childProgramCourse->endTime + (time_t)offsetTZMinutes * 60, restStartHHmm, endStartHHmm) / 60;
			//}
			actualDurationMinute += duration;
		}
	}
	return std::make_tuple(actualDurationMinute, actualLegNum);
}

//actualDurationMinute大于等于任何一个requiredDurationMinuteList，则返回true
inline static bool greaterThanOrEqualToAny(const int actualDurationMinute, const vector<int>& requiredDurationMinuteList) {
	for (auto requiredDurationMinute : requiredDurationMinuteList) {
		if (actualDurationMinute >= requiredDurationMinute) {
			return true;
		}
	}
	return false;
}

bool LimitCourseDurationForEvaFdRule::IgnoreCourse(const std::shared_ptr<TmCourse>& tmCourse) const {
	if (tmCourse == nullptr) {
		return true;
	}

	string strIgnoreCourseCodes;
	auto it = _dbData->systemParamMap.find("RULE7242_IGNORE_COURSE_CODE");//忽略课程代码
	if (it != _dbData->systemParamMap.end()) {
		strIgnoreCourseCodes = it->second;
	}

	vector<string> ignoreCourseCodeList = { "EM1", "EM2", "TM1", "TM2", "MT1", "MT2", "EX1", "EX2", "SDI", "SDC", "PBNEM","OBSEM","PBNTM2","PBNTM1","OBSTM","PBNTM" };
	if (!strIgnoreCourseCodes.empty() && strIgnoreCourseCodes != "*") {
		ignoreCourseCodeList.clear();
		split(strIgnoreCourseCodes.c_str(), '|', ignoreCourseCodeList);
	}

	return std::find(ignoreCourseCodeList.begin(), ignoreCourseCodeList.end(), tmCourse->courseCode) != ignoreCourseCodeList.end();
}

//检查训练课程时间段限制 - 持续时长
bool LimitCourseDurationForEvaFdRule::CheckCourseDuration(const int actualDurationMinute, const int actualLegNum, const std::shared_ptr<CREW>& crew, const std::shared_ptr<TmProgramCourse>& parentProgramCourse, const std::shared_ptr<TmProgramCoursePnr>& programCoursePnr, const std::shared_ptr<TmCourse>& tmCourse) const {
	bool valid = true;
	vector<int> requiredDurationMinuteList;
	if (tmCourse->courseType == CourseType::SIM) {
		//SIM模拟机通过tm_pairing_XXX获得课程时长
		requiredDurationMinuteList = TrainingCourseUtils::GetCourseDurationWithSIM(crew, programCoursePnr, parentProgramCourse->courseId, this->GetDataContext());
	}
	else {
		if (programCoursePnr == nullptr) {
			return true;
		}
		_ruleViolation.SetParam("programCoursePnrId", StringUtils::lltos(programCoursePnr->id));
		int requiredDurationMinute = GetProgramCourseDuration(programCoursePnr);
		requiredDurationMinuteList.emplace_back(requiredDurationMinute);
	}
	if (requiredDurationMinuteList.empty() || requiredDurationMinuteList[0] <= 0) {
		return true;
	}

	if (tmCourse->courseType == CourseType::GROUND) {
		if (actualDurationMinute != requiredDurationMinuteList[0]) {
			_ruleViolation.SetParam("requiredDurationMinuteHHmm", TimeUtils::MinutesTohhmm(requiredDurationMinuteList[0]));
			valid = false;
		}
	}
	else if (tmCourse->courseType == CourseType::SIM) {
		if (!greaterThanOrEqualToAny(actualDurationMinute, requiredDurationMinuteList)) {
			//使用|分割
			string str = std::accumulate(
				requiredDurationMinuteList.begin() + 1,  // 从第二个元素开始（第一个元素作为初始值）
				requiredDurationMinuteList.end(),
				TimeUtils::MinutesTohhmm(requiredDurationMinuteList[0]),  // 初始值：第一个元素转为字符串
				[](const std::string& acc, int val) {
					return acc + "|" + TimeUtils::MinutesTohhmm(val);  // 累加时拼接逗号和当前元素
				}
			);
			_ruleViolation.SetParam("requiredDurationMinuteHHmm", str);
			valid = false;
		}
	}
	else if (tmCourse->courseType == CourseType::LINE) {
		if (actualLegNum != requiredDurationMinuteList[0]) {
			_ruleViolation.SetParam("requiredLegNum", StringUtils::itos(requiredDurationMinuteList[0]));
			valid = false;
		}
	}

	return valid;
}

bool LimitCourseDurationForEvaFdRule::CheckCourseDuration(const int actualDurationMinute, const int actualLegNum, const std::shared_ptr<TmCourseDuration>& tmCourseDuration, const std::shared_ptr<TmCourse>& tmCourse) const {
	bool valid = true;
	if (actualLegNum < 0) {
		//培训课程类型(CourseType)为GROUND、SIM
		if (tmCourse->courseType == CourseType::GROUND) {
			if (tmCourseDuration->duration >= 0 && actualDurationMinute != tmCourseDuration->duration) {
				_ruleViolation.SetParam("requiredDurationMinuteHHmm", TimeUtils::MinutesTohhmm(tmCourseDuration->duration));
				valid = false;
			}
		}
		else if (tmCourse->courseType == CourseType::SIM) {
			if (tmCourseDuration->duration >= 0 && actualDurationMinute < tmCourseDuration->duration) {
				_ruleViolation.SetParam("requiredDurationMinuteHHmm", TimeUtils::MinutesTohhmm(tmCourseDuration->duration));
				valid = false;
			}
		}
	}
	else {
		//培训课程类型(CourseType)为Line
		if (tmCourseDuration->num >= 0 && actualLegNum != tmCourseDuration->num) {
			_ruleViolation.SetParam("requiredLegNum", StringUtils::itos(tmCourseDuration->num));
			valid = false;
		}
	}
	return valid;
}

bool LimitCourseDurationForEvaFdRule::CheckRule(const int actualDurationMinute, const int actualLegNum, const std::shared_ptr<TmProgramCourse>& parentProgramCourse, const vector<std::shared_ptr<TmProgramCourse>>& childProgramCourseList, const std::shared_ptr<TmCourse>& tmCourse, const std::shared_ptr<CREW>& crew) const {
	bool passAllRule = true;

	_ruleViolation.SetParam("programCourseId", StringUtils::lltos(parentProgramCourse->id));
	_ruleViolation.SetParam("courseId", StringUtils::lltos(tmCourse->id));
	_ruleViolation.SetParam("courseType", tmCourse->courseType);
	_ruleViolation.SetParam("courseCode", tmCourse->courseCode);
	_ruleViolation.SetParam("actualDurationMinute", TimeUtils::MinutesTohhmm(actualDurationMinute));
	_ruleViolation.SetParam("requiredDurationMinuteHHmm", "");
	_ruleViolation.SetParam("requiredLegNum", "");

	const auto teProgramCoursePnr = this->_dbData->tmProgramCoursePnrIndex->getByProgramCourseId(parentProgramCourse->id);
	if (tmCourse->courseType != CourseType::SIM && teProgramCoursePnr == nullptr) {
		//标准化配置，按TmCourse配置检查

		//检查培训课程时长限制
		auto tmCourseDurationList = _dbData->tmCourseDurationIndex->getByCourseId(tmCourse->id);
		bool valid = true;
		for (auto& tmCourseDuration : tmCourseDurationList) {
			//_ruleViolation.SetParam("courseDuration", TimeUtils::MinutesTohhmm(tmCourseDuration->duration));
			if (!CheckCourseDuration(actualDurationMinute, actualLegNum, tmCourseDuration, tmCourse)) {
				valid = false;
				break;
			}
		}
		if (!valid) {
			passAllRule = false;
			ThrowRuleViolation(parentProgramCourse, childProgramCourseList, tmCourse);
		}

	}
	else {
		//存在个性化配置，按TmProgramCoursePnr配置检查

		//检查培训课程时长限制
		if (!CheckCourseDuration(actualDurationMinute, actualLegNum, crew, parentProgramCourse, teProgramCoursePnr, tmCourse)) {
			passAllRule = false;

			_ruleViolation.SetParam("actualDurationMinute", TimeUtils::MinutesTohhmm(actualDurationMinute));
			_ruleViolation.SetParam("actualLegNum", StringUtils::itos(actualLegNum));
			ThrowRuleViolation(parentProgramCourse, childProgramCourseList, tmCourse);

			if (!IsCheckAllRule()) {
				return passAllRule;
			}
		}
	}
	return passAllRule;
}

std::tuple<long long, time_t, time_t> LimitCourseDurationForEvaFdRule::GetWarningPeriod(const vector<std::shared_ptr<TmProgramCourse>>& childProgramCourseList) const {
	auto& scenario = _dbData->scenario;
	long long rosterId = 0;
	time_t startTimeUtc = 0, endTimeUtc = 0;
	for (auto& childProgramCourse : childProgramCourseList) {

		if (childProgramCourse->startTime > scenario.startDtUTC && childProgramCourse->endTime < scenario.endDtUTC) {
			rosterId = childProgramCourse->rosterId == 0 ? childProgramCourse->rosterGroundId : childProgramCourse->rosterId;
			startTimeUtc = childProgramCourse->startTime;
			endTimeUtc = childProgramCourse->endTime;
			break;
		}
	}
	if (rosterId == 0 && !childProgramCourseList.empty()) {
		//未找到合适的rosterId，取第一个programCourse的rosterId
		auto& firstProgramCourse = childProgramCourseList[0];
		rosterId = firstProgramCourse->rosterId == 0 ? firstProgramCourse->rosterGroundId : firstProgramCourse->rosterId;
		startTimeUtc = firstProgramCourse->startTime;
		endTimeUtc = firstProgramCourse->endTime;
    }
	return std::make_tuple(rosterId, startTimeUtc, endTimeUtc);
}

int LimitCourseDurationForEvaFdRule::GetProgramCourseDuration(const std::shared_ptr<TmProgramCoursePnr>& programCoursePnr) const {
	if (programCoursePnr == nullptr) {
		return -1;
	}
	int duration = 0;
	if (programCoursePnr->unit == "H") {
		//小时
		duration = static_cast<int>(programCoursePnr->duration * 60);
	}
	else if (programCoursePnr->unit == "M") {
		//分钟
		duration = static_cast<int>(programCoursePnr->duration);
	}
	else if (programCoursePnr->unit == "LEG") {
		//航段数量
		duration = static_cast<int>(programCoursePnr->duration);
	}
	return duration;
}

void LimitCourseDurationForEvaFdRule::ParseParam(const InputType& input) {
	//add by hexd 添加DBRule支持
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(LimitCourseDurationForEvaFdRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}
	if (!_ruleParams.empty()) {
		return;
	}
	for (const auto& singleRuleParamString : input.ruleParamString) {
		_ruleParams.emplace_back(LimitCourseDurationForEvaFdRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(singleRuleParamString);
	}
}

void LimitCourseDurationForEvaFdRule::ThrowRuleViolation(const std::shared_ptr<TmProgramCourse>& parentProgramCourse, const vector<std::shared_ptr<TmProgramCourse>>& childProgramCourseList, const std::shared_ptr<TmCourse>& tmCourse) const {
	string requiredDurationMinuteHHmm = _ruleViolation.GetParam("requiredDurationMinuteHHmm");
	string actualDurationMinute = _ruleViolation.GetParam("actualDurationMinute");

	string requiredLegNum = _ruleViolation.GetParam("requiredLegNum");
	string actualLegNum = _ruleViolation.GetParam("actualLegNum");

	string programCoursePnrId = _ruleViolation.GetParam("programCoursePnrId");

	auto [programCourseRosterId, programCourseStartTimeUtc, programCourseEndTimeUtc] = GetWarningPeriod(childProgramCourseList);

	//分配的课程X时长（{1:actualDurationMinute}）不符合课程要求（{2:requiredDurationMinuteHHmm}）。
	std::string msg = "The assigned course {0:courseCode} duration ({1:actualDurationMinute}) doesn't meet the course requirements ({2:requiredDurationMinuteHHmm}).";
	msg = StringUtils::Format(msg, tmCourse->courseCode, actualDurationMinute, requiredDurationMinuteHHmm);
	if (tmCourse->courseType == CourseType::LINE) {
		if (!requiredLegNum.empty() && !actualLegNum.empty()) {
			//分配的课程 X 航段数量（{1:actualLegNum}）不符合课程要求（{2:requiredLegNum}）。
			msg = "The assigned course {0:courseCode} Leg Number ({1:actualLegNum}) doesn't meet the course requirements ({2:requiredLegNum}).";
			msg = StringUtils::Format(msg, tmCourse->courseCode, actualLegNum, requiredLegNum);
		}
	}

	RULE_VIOLATION* rv = new RULE_VIOLATION();
	if (_ruleViolation.GetRuleLegality() != nullptr) {
		_ruleViolation.GetRuleLegality()->isLegal = false;
		_ruleViolation.GetRuleLegality()->skipCheckInLaterIterations = true;

		SharedPtr<CREW> ppCrew = (this->_dbData->crewList[_ruleViolation.GetRuleLegality()->crewIndex]);
		rv->rosterId = programCourseRosterId;
		rv->crewId = ppCrew->idCrew;
		_ruleViolation.SetLegalityMessage(ppCrew, msg);
		rv->type = VIOLATION_TYPE::CREW_VIOLATION;
	}
	else {
		rv->type = VIOLATION_TYPE::PAIRING_VIOLATION;
	}

	rv->pairingId = -1;
	rv->startDTUtc = programCourseStartTimeUtc;
	rv->endDTUtc = programCourseEndTimeUtc;
	rv->violation_msg = msg;
	rv->operation_result.insert(pair<string, string>("requiredDurationMinuteHHmm", requiredDurationMinuteHHmm));
	rv->operation_result.insert(pair<string, string>("actualDurationMinute", actualDurationMinute));
	rv->operation_result.insert(pair<string, string>("requiredLegNum", requiredLegNum));
	rv->operation_result.insert(pair<string, string>("actualLegNum", actualLegNum));
	rv->operation_result.insert(pair<string, string>("courseId", StringUtils::lltos(tmCourse->id)));
	rv->operation_result.insert(pair<string, string>("courseType", tmCourse->courseType));
	rv->operation_result.insert(pair<string, string>("courseCode", tmCourse->courseCode));
	rv->operation_result.insert(pair<string, string>("programId", StringUtils::lltos(parentProgramCourse->programId)));
	rv->operation_result.insert(pair<string, string>("parentProgramCourseId", StringUtils::lltos(parentProgramCourse->id)));
	rv->operation_result.insert(pair<string, string>("programCoursePnrId", programCoursePnrId));
	_ruleViolation.AddRuleViolations(rv);
}

