/**
 * @file LimitLegAndStationForEvaFdRule.cpp
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#include "../RuleSytem.h"
#include "LimitLegAndStationForEvaFdRule.h"
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
#include <iterator>

inline static void updateLineProgramCourseFlight(vector<std::shared_ptr<TmProgramCourse>>& tmLineProgramCourseList, SharedPtr<CrewDataContext>& dbData) {
	for (auto& tmProgramCourse : tmLineProgramCourseList) {
		auto iterSeg = dbData->flightIdMap.find(tmProgramCourse->fltId);
		if (iterSeg != dbData->flightIdMap.end()) {
			auto& flight = iterSeg->second;
			tmProgramCourse->fleet = flight->getFleetCD();
			tmProgramCourse->depStation = flight->getDepStationRead();
			tmProgramCourse->arrStation = flight->getArrStationRead();
			tmProgramCourse->actStartTimeUtc = flight->getStartTimeUtcAct();
			tmProgramCourse->actEndTimeUtc = flight->getEndTimeUtcAct();
		}
	}
}

bool LimitLegAndStationForEvaFdRule::CheckRule(const std::shared_ptr<CREW>& crew) const {
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

	//按program分组，获得已排课的programCourse。返回值：map<programId, 培训计划program下已排课排课的programCourse>
	map<long long, vector<std::shared_ptr<TmProgramCourse>>> programCourseMap = TrainingCourseUtils::GetProgramCourseInProgram(crew, this->GetDataContext());

	for (auto& pair : programCourseMap) {
		long long programId = pair.first;
		vector<std::shared_ptr<TmProgramCourse>> tmLineProgramCourseList;//Line课程的Program Course
		for (auto& tmProgramCourse : pair.second) {
			auto course = TrainingCourseUtils::GetCourseByCourseId(tmProgramCourse->courseId, _dbData);
			if (course != nullptr && course->courseType == CourseType::LINE) {
				tmLineProgramCourseList.emplace_back(tmProgramCourse);
			}
		}
		
		//更新Line课程的Flight信息，确保课程的航班信息与缓存中航班信息一致
		updateLineProgramCourseFlight(tmLineProgramCourseList, _dbData);

		for (auto& tmProgramCourse : tmLineProgramCourseList) {
			if (!CheckRule(tmProgramCourse, tmLineProgramCourseList)) {
				passAllRule = false;
				if (!IsCheckAllRule()) {
					break;
				}
			}
			
		}
	}
	return passAllRule;
}

bool LimitLegAndStationForEvaFdRule::CheckRule(const std::shared_ptr<TmProgramCourse>& tmProgramCourse, const vector<std::shared_ptr<TmProgramCourse>>& tmProgramCourseList) const {
	bool valid = true;
	auto tmProgramCourseMoreList = _dbData->tmProgramCourseMoreIndex->getByProgramCourseId(tmProgramCourse->parentId);
	for (auto& tmProgramCourseMore : tmProgramCourseMoreList) {
		if (!CheckRule(tmProgramCourse, tmProgramCourseList, tmProgramCourseMore)) {
			valid = false;
			if (!IsCheckAllRule()) {
				break;
			}
		}
	}
	return valid;
}

bool LimitLegAndStationForEvaFdRule::CheckRule(const std::shared_ptr<TmProgramCourse>& tmProgramCourse, const vector<std::shared_ptr<TmProgramCourse>>& tmProgramCourseList, const std::shared_ptr<TmProgramCourseMore>& tmProgramCourseMore) const {
	bool valid = true;
	auto tmProgramCourseMoreLegList = _dbData->tmProgramCourseMoreLegIndex->getByProgramCourseMoreId(tmProgramCourseMore->id);
	for (auto& tmProgramCourseMoreLeg : tmProgramCourseMoreLegList) {
		if (!CheckRule(tmProgramCourse, tmProgramCourseList, tmProgramCourseMore, tmProgramCourseMoreLeg)) {
			valid = false;
			if (!IsCheckAllRule()) {
				break;
			}
		}
	}
	return valid;
}

bool LimitLegAndStationForEvaFdRule::CheckRule(const std::shared_ptr<TmProgramCourse>& tmProgramCourse, const vector<std::shared_ptr<TmProgramCourse>>& tmProgramCourseList, 
	const std::shared_ptr<TmProgramCourseMore>& tmProgramCourseMore, const std::shared_ptr<TmProgramCourseMoreLeg>& tmProgramCourseMoreLeg) const {
	bool valid = true;
	vector<std::shared_ptr<TmProgramCourse>> segmentProgramCourses = GetSegmentProgramCourses(tmProgramCourseList, tmProgramCourseMoreLeg);
	if (segmentProgramCourses.empty() && tmProgramCourseMoreLeg->legForce == "MUSTNOTGO") {
		//当前满足条件航班是空，并且要求不能执行飞行（MUSTNOTGO）条件，则直接返回true
		return true;
	}

	auto actualLegStationCount = GetActualLegStationCount(segmentProgramCourses, tmProgramCourseMoreLeg);
	if (tmProgramCourseMoreLeg->legSector >= 0 && tmProgramCourseMore->legStation == "LEG") {
		if (!CheckViaStationByLeg(actualLegStationCount, tmProgramCourse, tmProgramCourseList, tmProgramCourseMore, tmProgramCourseMoreLeg)) {
			valid = false;
		}
	}
	else if (tmProgramCourseMoreLeg->legSector >= 0 && tmProgramCourseMore->legStation == "STATION") {
		if (!CheckViaStationByStation(actualLegStationCount, tmProgramCourse, tmProgramCourseList, tmProgramCourseMore, tmProgramCourseMoreLeg)) {
			valid = false;
		}
	}


	return valid;
}

bool LimitLegAndStationForEvaFdRule::CheckViaStationByLeg(const ActualLegStationCount& actualLegStationCount, const std::shared_ptr<TmProgramCourse>& tmProgramCourse, const vector<std::shared_ptr<TmProgramCourse>>& tmProgramCourseList, const std::shared_ptr<TmProgramCourseMore>& tmProgramCourseMore, const std::shared_ptr<TmProgramCourseMoreLeg>& tmProgramCourseMoreLeg) const {
	bool valid = true;
	if (tmProgramCourseMoreLeg->allLegStations.empty()) {
		if (tmProgramCourseMoreLeg->legSector > actualLegStationCount.legCount) {
			ThrowRuleViolationForLegSector(actualLegStationCount, tmProgramCourse, tmProgramCourseList, tmProgramCourseMore, tmProgramCourseMoreLeg);
			valid = false;
		}
	}
	else {

		if (tmProgramCourseMoreLeg->legForce == "ANYOF" || tmProgramCourseMoreLeg->legForce == "GOTOONE") {
			//anyOf (原名称叫：goToOne) 满足条件的航段列表中必須每個航段包含經過配置的 【機場三字碼】中的其中一個
			if (tmProgramCourseMoreLeg->legSector > actualLegStationCount.legCountInStations) {
				ThrowRuleViolationForViaStation(actualLegStationCount, tmProgramCourse, tmProgramCourseList, tmProgramCourseMore, tmProgramCourseMoreLeg);
				valid = false;
			}
		}
		else if (tmProgramCourseMoreLeg->legForce == "MUSTGO") {//mustGo 所有站点必须都去
			//mustGo 满足条件的航段列表中必須每個航段包含配置的 【機場三字碼】中的其中一個，並且 10 個航段中所有機場三字碼必須包含配置的【機場三字碼】
			if (tmProgramCourseMoreLeg->legSector > actualLegStationCount.legCountInStations || actualLegStationCount.viaStationsInStations != tmProgramCourseMoreLeg->allLegStations) {
				ThrowRuleViolationForViaStation(actualLegStationCount, tmProgramCourse, tmProgramCourseList, tmProgramCourseMore, tmProgramCourseMoreLeg);
				valid = false;
			}
		}
		else if (tmProgramCourseMoreLeg->legForce == "MUSTNOTGO") {//mustNotGo 所有站点都不能去
			if (tmProgramCourseMoreLeg->legSector < actualLegStationCount.legCountMustNotGo || !actualLegStationCount.viaStationsInStations.empty()) {
				ThrowRuleViolationForViaStation(actualLegStationCount, tmProgramCourse, tmProgramCourseList, tmProgramCourseMore, tmProgramCourseMoreLeg);
				valid = false;
			}
		}
	}
	return valid;
}

bool LimitLegAndStationForEvaFdRule::CheckViaStationByStation(const ActualLegStationCount& actualLegStationCount, const std::shared_ptr<TmProgramCourse>& tmProgramCourse, const vector<std::shared_ptr<TmProgramCourse>>& tmProgramCourseList, const std::shared_ptr<TmProgramCourseMore>& tmProgramCourseMore, const std::shared_ptr<TmProgramCourseMoreLeg>& tmProgramCourseMoreLeg) const {
	bool valid = true;
	if (tmProgramCourseMoreLeg->allLegStations.empty()) {
		if (tmProgramCourseMoreLeg->legSector > actualLegStationCount.stationCount) {
			ThrowRuleViolationForLegStation(actualLegStationCount, tmProgramCourse, tmProgramCourseList, tmProgramCourseMore, tmProgramCourseMoreLeg);
			valid = false;
		}
	}
	else {

		if (tmProgramCourseMoreLeg->legForce == "ANYOF" || tmProgramCourseMoreLeg->legForce == "GOTOONE") {
			//anyOf (原名称叫：goToOne) 满足条件的航段列表中必須每個航段包含經過配置的 【機場三字碼】中的其中一個
			if (tmProgramCourseMoreLeg->legSector > actualLegStationCount.stationCountInStations) {
				ThrowRuleViolationForViaStation(actualLegStationCount, tmProgramCourse, tmProgramCourseList, tmProgramCourseMore, tmProgramCourseMoreLeg);
				valid = false;
			}
		}
		else if (tmProgramCourseMoreLeg->legForce == "MUSTGO") {//mustGo 所有站点必须都去
			//mustGo 满足条件的航段列表中必須每個航段包含配置的 【機場三字碼】中的其中一個，並且 10 個航段中所有機場三字碼必須包含配置的【機場三字碼】
			if (tmProgramCourseMoreLeg->legSector > actualLegStationCount.stationCountInStations || actualLegStationCount.viaStationsInStations != tmProgramCourseMoreLeg->allLegStations) {
				ThrowRuleViolationForViaStation(actualLegStationCount, tmProgramCourse, tmProgramCourseList, tmProgramCourseMore, tmProgramCourseMoreLeg);
				valid = false;
			}
		}
		else if (tmProgramCourseMoreLeg->legForce == "MUSTNOTGO") {//mustNotGo 所有站点都不能去
			if (tmProgramCourseMoreLeg->legSector > actualLegStationCount.stationCountMustNotGo || !actualLegStationCount.viaStationsInStations.empty()) {
				ThrowRuleViolationForViaStation(actualLegStationCount, tmProgramCourse, tmProgramCourseList, tmProgramCourseMore, tmProgramCourseMoreLeg);
				valid = false;
			}
		}
	}
	return valid;
}


//ActualLegStationCount LimitLegAndStationForEvaFdRule::GetActualLegStationCount(const vector<std::shared_ptr<Segment>>& segments, const std::shared_ptr<TmProgramCourseMoreLeg>& tmProgramCourseMoreLeg) const {
//	map<string, int> depStationCountMap;//map<起飞站点,起飞次数>
//	map<string, int> arrStationCountMap;//map<落地站点,落地次数>
//	set<string> viaStations;//经过机场
//
//	vector<string> depStations;//起飞站点列表（Segment的起飞和落地在tmProgramCourseMoreLeg中allLegStations站点）
//	vector<string> arrStations;//落地站点列表（Segment的起飞和落地在tmProgramCourseMoreLeg中allLegStations站点）
//	int legCountInStations = 0;//同一站点，一次起飞一次降落分别计算，记为 2次（Segment的起飞和落地在tmProgramCourseMoreLeg中allLegStations站点）
//	int stationCountInStations = 0;//同一站点，一次起飞一次降落合并计算，记为1次（Segment的起飞和落地在tmProgramCourseMoreLeg中allLegStations站点）
//	set<string> viaStationsInStations;//经过机场（Segment的起飞和落地在tmProgramCourseMoreLeg中allLegStations站点）
//	for (auto& segment : segments) {
//
//		if (tmProgramCourseMoreLeg->allLegStations.find(segment->getDepStation()) != tmProgramCourseMoreLeg->allLegStations.end()) {
//			legCountInStations++;
//			auto iterArrStation = std::find(arrStations.begin(), arrStations.end(), segment->getDepStation());
//			if (iterArrStation  == arrStations.end()) {
//				depStations.emplace_back(segment->getDepStation());
//			}
//			else {
//				arrStations.erase(iterArrStation);
//				stationCountInStations++;
//			}
//			viaStationsInStations.emplace(segment->getDepStation());
//		}
//
//		if (tmProgramCourseMoreLeg->allLegStations.find(segment->getArrStation()) != tmProgramCourseMoreLeg->allLegStations.end()) {
//			legCountInStations++;
//
//			auto iterDepStation = std::find(depStations.begin(), depStations.end(), segment->getArrStation());
//			if (iterDepStation == depStations.end()) {
//				arrStations.emplace_back(segment->getArrStation());
//			}
//			else {
//				depStations.erase(iterDepStation);
//				stationCountInStations++;
//			}
//			viaStationsInStations.emplace(segment->getArrStation());
//		}
//
//		auto iterDepStation = depStationCountMap.find(segment->getDepStation());
//		if (iterDepStation == depStationCountMap.end()) {
//			depStationCountMap.insert(std::make_pair(segment->getDepStation(), 1));
//		}
//		else {
//			iterDepStation->second++;
//		}
//
//		auto iterArrStation = arrStationCountMap.find(segment->getArrStation());
//		if (iterArrStation == arrStationCountMap.end()) {
//			arrStationCountMap.insert(std::make_pair(segment->getArrStation(), 1));
//		}
//		else {
//			iterArrStation->second++;
//		}
//		viaStations.emplace(segment->getDepStation());
//		viaStations.emplace(segment->getArrStation());
//	}
//
//	int legCount = 0;//同一站点，一次起飞一次降落分别计算，记为 2次
//	for (auto& pair : depStationCountMap) {
//		legCount += pair.second;
//	}
//	for (auto& pair : arrStationCountMap) {
//		legCount += pair.second;
//	}
//
//	int stationCount = 0;//同一站点，一次起飞一次降落合并计算，记为1次
//	for (auto& depPair : depStationCountMap) {
//		auto iterArr = arrStationCountMap.find(depPair.first);
//		if (iterArr != arrStationCountMap.end()) {
//			stationCount += std::min(depPair.second, iterArr->second);
//		}
//	}
//	ActualLegStationCount actualLegStationCount;
//	actualLegStationCount.legCount = legCount;
//	actualLegStationCount.stationCount = stationCount;
//	actualLegStationCount.legCountInStations = legCountInStations;
//	actualLegStationCount.stationCountInStations = stationCountInStations;
//	actualLegStationCount.viaStationsInStations = viaStationsInStations;
//	actualLegStationCount.viaStations = viaStations;
//	return actualLegStationCount;
//}

//const vector<std::shared_ptr<Segment>> LimitLegAndStationForEvaFdRule::GetSegments(const vector<std::shared_ptr<TmProgramCourse>>& tmLineProgramCourseList, const std::shared_ptr<TmProgramCourseMoreLeg>& tmProgramCourseMoreLeg) const {
//	vector<std::shared_ptr<Segment>> allSegments;
//
//	for (auto& tmProgramCourse : tmLineProgramCourseList) {
//		auto& legCategory = tmProgramCourseMoreLeg->legCategory;
//		auto& legPhases = tmProgramCourseMoreLeg->legPhases;
//		if (legCategory == "PHASE") {
//			if (std::find(legPhases.begin(), legPhases.end(), tmProgramCourse->coursePhase) == legPhases.end()) {
//				continue;
//			}
//		}
//		else if (legCategory == "COURSE") {
//			if (std::find(legPhases.begin(), legPhases.end(), tmProgramCourse->courseSeq) == legPhases.end()) {
//				continue;
//			}
//		}
//
//		if (tmProgramCourse->isExtraCourse) {
//			//加课不计算在内
//			continue;
//		}
//
//		auto iterSeg = _dbData->flightIdMap.find(tmProgramCourse->fltId);
//		if (iterSeg != _dbData->flightIdMap.end()) {
//			if (MatchLegPassenger(iterSeg->second, tmProgramCourseMoreLeg->legPassenger)) {
//				allSegments.emplace_back(iterSeg->second);
//			}
//		}
//	}
//
//	//按航段开始时间升序排序
//	std::sort(allSegments.begin(), allSegments.end(), [](const std::shared_ptr<Segment>& a, const std::shared_ptr<Segment>& b) {
//		return a->getStartTimeUtcAct() < b->getStartTimeUtcAct();
//	});
//	
//	auto segments =	GetFilterSegments(allSegments, tmProgramCourseMoreLeg->legRange, tmProgramCourseMoreLeg->legBefore, tmProgramCourseMoreLeg->legAfter);
//	return segments;
//}

//const vector<std::shared_ptr<Segment>> LimitLegAndStationForEvaFdRule::GetFilterSegments(const vector<std::shared_ptr<Segment>>& allSegments, const string& legRange, const int legBefore, const int legAfter) const {
//	if (allSegments.empty()) {
//		return vector<std::shared_ptr<Segment>>();
//	}
//	if (legRange.empty()) {
//		return allSegments;
//	}
//	int start = 0;
//	int end = 0;
//	if (legRange == "BETWEEN") { 
//		//segment范围：[legBefore,legAfter]
//		start = legBefore <= 0 ? 0 : (legBefore >= (int)allSegments.size() ? ((int)allSegments.size() - 1) : (legBefore - 1));
//		end = legAfter <= 0 ? 0 : (legAfter >= (int)allSegments.size() ? ((int)allSegments.size() - 1) : (legAfter - 1));
//		end++;
//		if (end >= (int)allSegments.size()) end = (int)allSegments.size();
//	}
//	else if (legRange == "AFTER") {
//		//segment范围：> legAfter
//		start = legAfter <= 0 ? 0 : (legAfter >= (int)allSegments.size() ? ((int)allSegments.size() - 1) : (legAfter - 1));
//		start++;
//		if (start >= (int)allSegments.size()) start = (int)allSegments.size();
//		end = (int)allSegments.size();
//	}
//	else if (legRange == "BEFORE") {
//		//segment范围：< legBefore
//		start = 0;
//		end = legBefore <= 0 ? 0 : (legBefore >= (int)allSegments.size() ? (int)allSegments.size() : legBefore);
//		if (end >= (int)allSegments.size()) end = (int)allSegments.size();
//	}
//	//std::vector的迭代器范围遵循‌左闭右开‌原则
//	return vector<std::shared_ptr<Segment>>(allSegments.begin() + start, allSegments.begin() + end);
//}

//bool LimitLegAndStationForEvaFdRule::MatchLegPassenger(const std::shared_ptr<Segment>& segment, const string& legPassenger) const {
//	string cargoFleet = "B77X";
//	auto it = _dbData->systemParamMap.find("CARGO_FLIGHT_FLEET");//货机航班机型
//	if (it != _dbData->systemParamMap.end()) {
//		cargoFleet = it->second;
//	}
//	vector<string> cargoFleets;
//	split(cargoFleet.c_str(), '|', cargoFleets);
//
//	bool matched = true;
//	if (legPassenger == "ALL") { //ALL-货机和客机
//		matched = true;
//	}
//	else if (legPassenger == "CARGO FLIGHT") { //Cargo Flight：货机B77X
//		matched = (std::find(cargoFleets.begin(), cargoFleets.end(), segment->getFleetCD()) != cargoFleets.end());
//	}
//	else if (legPassenger == "PASSENGER FLIGHT") { //Passenger Flight：客机
//		matched = (std::find(cargoFleets.begin(), cargoFleets.end(), segment->getFleetCD()) == cargoFleets.end());
//	}
//	return matched;
//}

ActualLegStationCount LimitLegAndStationForEvaFdRule::GetActualLegStationCount(const vector<std::shared_ptr<TmProgramCourse>>& segmentProgramCourses, const std::shared_ptr<TmProgramCourseMoreLeg>& tmProgramCourseMoreLeg) const {
	map<string, int> depStationCountMap;//map<起飞站点,起飞次数>
	map<string, int> arrStationCountMap;//map<落地站点,落地次数>
	set<string> viaStations;//经过机场

	vector<string> depStations;//起飞站点列表（Segment的起飞和落地在tmProgramCourseMoreLeg中allLegStations站点）
	vector<string> arrStations;//落地站点列表（Segment的起飞和落地在tmProgramCourseMoreLeg中allLegStations站点）
	int legCountInStations = 0;//同一站点，一次起飞一次降落分别计算，记为 2次（Segment的起飞和落地在tmProgramCourseMoreLeg中allLegStations站点）
	int stationCountInStations = 0;//同一站点，一次起飞一次降落合并计算，记为1次（Segment的起飞和落地在tmProgramCourseMoreLeg中allLegStations站点）
	set<string> viaStationsInStations;//经过机场（Segment的起飞和落地在tmProgramCourseMoreLeg中allLegStations站点）
	int legCountMustNotGo = 0; //不能去航段数量（Segment的起飞和落地不能在tmProgramCourseMoreLeg中allLegStations站点中）

	vector<string> depStationsInStationCountMustNotGot;//起飞站点列表(用于"不能去航站数量")统计
	vector<string> arrStationsInStationCountMustNotGot;//起飞站点列表(用于"不能去航站数量")统计
	int stationCountMustNotGo = 0;//不能去航站数量（Segment的起飞或落地不能在tmProgramCourseMoreLeg中allLegStations站点中, 同一站点，一次起飞一次降落合并计算，记为1次，仅单个起飞或降落不计算）
	for (auto& segmentProgramCourse : segmentProgramCourses) {

		if (tmProgramCourseMoreLeg->allLegStations.find(segmentProgramCourse->depStation) == tmProgramCourseMoreLeg->allLegStations.end()
			&& tmProgramCourseMoreLeg->allLegStations.find(segmentProgramCourse->arrStation) == tmProgramCourseMoreLeg->allLegStations.end()) {
			legCountMustNotGo++;
		}

		if (tmProgramCourseMoreLeg->allLegStations.find(segmentProgramCourse->depStation) == tmProgramCourseMoreLeg->allLegStations.end()) {
			auto iterArrStation = std::find(arrStationsInStationCountMustNotGot.begin(), arrStationsInStationCountMustNotGot.end(), segmentProgramCourse->depStation);
			if (iterArrStation == arrStationsInStationCountMustNotGot.end()) {
				depStationsInStationCountMustNotGot.emplace_back(segmentProgramCourse->depStation);
			}
			else {
				arrStationsInStationCountMustNotGot.erase(iterArrStation);
				stationCountMustNotGo++;
			}
		}

		if (tmProgramCourseMoreLeg->allLegStations.find(segmentProgramCourse->arrStation) == tmProgramCourseMoreLeg->allLegStations.end()) {
			auto iterDepStation = std::find(depStationsInStationCountMustNotGot.begin(), depStationsInStationCountMustNotGot.end(), segmentProgramCourse->arrStation);
			if (iterDepStation == depStationsInStationCountMustNotGot.end()) {
				arrStationsInStationCountMustNotGot.emplace_back(segmentProgramCourse->arrStation);
			}
			else {
				depStationsInStationCountMustNotGot.erase(iterDepStation);
				stationCountMustNotGo++;
			}
		}

		if (tmProgramCourseMoreLeg->allLegStations.find(segmentProgramCourse->depStation) != tmProgramCourseMoreLeg->allLegStations.end()) {
			legCountInStations++;
			auto iterArrStation = std::find(arrStations.begin(), arrStations.end(), segmentProgramCourse->depStation);
			if (iterArrStation == arrStations.end()) {
				depStations.emplace_back(segmentProgramCourse->depStation);
			}
			else {
				arrStations.erase(iterArrStation);
				stationCountInStations++;
			}
			viaStationsInStations.emplace(segmentProgramCourse->depStation);
		}

		if (tmProgramCourseMoreLeg->allLegStations.find(segmentProgramCourse->arrStation) != tmProgramCourseMoreLeg->allLegStations.end()) {
			legCountInStations++;

			auto iterDepStation = std::find(depStations.begin(), depStations.end(), segmentProgramCourse->arrStation);
			if (iterDepStation == depStations.end()) {
				arrStations.emplace_back(segmentProgramCourse->arrStation);
			}
			else {
				depStations.erase(iterDepStation);
				stationCountInStations++;
			}
			viaStationsInStations.emplace(segmentProgramCourse->arrStation);
		}

		auto iterDepStation = depStationCountMap.find(segmentProgramCourse->depStation);
		if (iterDepStation == depStationCountMap.end()) {
			depStationCountMap.insert(std::make_pair(segmentProgramCourse->depStation, 1));
		}
		else {
			iterDepStation->second++;
		}

		auto iterArrStation = arrStationCountMap.find(segmentProgramCourse->arrStation);
		if (iterArrStation == arrStationCountMap.end()) {
			arrStationCountMap.insert(std::make_pair(segmentProgramCourse->arrStation, 1));
		}
		else {
			iterArrStation->second++;
		}
		viaStations.emplace(segmentProgramCourse->depStation);
		viaStations.emplace(segmentProgramCourse->arrStation);
	}

	int legCount = 0;//同一站点，一次起飞一次降落分别计算，记为 2次
	for (auto& pair : depStationCountMap) {
		legCount += pair.second;
	}
	for (auto& pair : arrStationCountMap) {
		legCount += pair.second;
	}

	int stationCount = 0;//同一站点，一次起飞一次降落合并计算，记为1次
	for (auto& depPair : depStationCountMap) {
		auto iterArr = arrStationCountMap.find(depPair.first);
		if (iterArr != arrStationCountMap.end()) {
			stationCount += std::min(depPair.second, iterArr->second);
		}
	}
	ActualLegStationCount actualLegStationCount;
	actualLegStationCount.legCount = legCount;
	actualLegStationCount.stationCount = stationCount;
	actualLegStationCount.legCountInStations = legCountInStations;
	actualLegStationCount.stationCountInStations = stationCountInStations;
	actualLegStationCount.viaStationsInStations = viaStationsInStations;
	actualLegStationCount.viaStations = viaStations;
	actualLegStationCount.legCountMustNotGo = legCountMustNotGo;
	actualLegStationCount.stationCountMustNotGo = stationCountMustNotGo;
	return actualLegStationCount;
}

const vector<std::shared_ptr<TmProgramCourse>> LimitLegAndStationForEvaFdRule::GetSegmentProgramCourses(const vector<std::shared_ptr<TmProgramCourse>>& tmLineProgramCourseList, const std::shared_ptr<TmProgramCourseMoreLeg>& tmProgramCourseMoreLeg) const {
	vector<std::shared_ptr<TmProgramCourse>> allSegmentProgramCourses;

	for (auto& tmProgramCourse : tmLineProgramCourseList) {
		auto& legCategory = tmProgramCourseMoreLeg->legCategory;
		auto& legPhases = tmProgramCourseMoreLeg->legPhases;
		if (legCategory == "PHASE") {
			if (std::find(legPhases.begin(), legPhases.end(), tmProgramCourse->coursePhase) == legPhases.end()) {
				continue;
			}
		}
		else if (legCategory == "COURSE") {
			if (std::find(legPhases.begin(), legPhases.end(), tmProgramCourse->courseSeq) == legPhases.end()) {
				continue;
			}
		}

		if (tmProgramCourse->isExtraCourse) {
			//加课不计算在内
			continue;
		}

		if (MatchLegPassenger(tmProgramCourse, tmProgramCourseMoreLeg->legPassenger)) {
			allSegmentProgramCourses.emplace_back(tmProgramCourse);
		}
	}

	//按航段开始时间升序排序
	std::sort(allSegmentProgramCourses.begin(), allSegmentProgramCourses.end(), [](const std::shared_ptr<TmProgramCourse>& a, const std::shared_ptr<TmProgramCourse>& b) {
		return a->actStartTimeUtc < b->actStartTimeUtc;
		});

	auto segmentProgramCourses = GetFilterSegmentProgramCourses(allSegmentProgramCourses, tmProgramCourseMoreLeg->legRange, tmProgramCourseMoreLeg->legBefore, tmProgramCourseMoreLeg->legAfter);
	return segmentProgramCourses;
}

const vector<std::shared_ptr<TmProgramCourse>> LimitLegAndStationForEvaFdRule::GetFilterSegmentProgramCourses(const vector<std::shared_ptr<TmProgramCourse>>& allSegmentProgramCourses, const string& legRange, const int legBefore, const int legAfter) const {
	if (allSegmentProgramCourses.empty()) {
		return vector<std::shared_ptr<TmProgramCourse>>();
	}
	if (legRange.empty()) {
		return allSegmentProgramCourses;
	}
	int start = 0;
	int end = 0;
	if (legRange == "BETWEEN") {
		//segment范围：[legBefore,legAfter]
		start = legBefore <= 0 ? 0 : (legBefore >= (int)allSegmentProgramCourses.size() ? ((int)allSegmentProgramCourses.size() - 1) : (legBefore - 1));
		end = legAfter <= 0 ? 0 : (legAfter >= (int)allSegmentProgramCourses.size() ? ((int)allSegmentProgramCourses.size() - 1) : (legAfter - 1));
		end++;
		if (end >= (int)allSegmentProgramCourses.size()) end = (int)allSegmentProgramCourses.size();
	}
	else if (legRange == "AFTER") {
		//segment范围：> legAfter
		start = legAfter <= 0 ? 0 : (legAfter >= (int)allSegmentProgramCourses.size() ? ((int)allSegmentProgramCourses.size() - 1) : (legAfter - 1));
		start++;
		if (start >= (int)allSegmentProgramCourses.size()) start = (int)allSegmentProgramCourses.size();
		end = (int)allSegmentProgramCourses.size();
	}
	else if (legRange == "BEFORE") {
		//segment范围：< legBefore
		start = 0;
		end = legBefore <= 0 ? 0 : (legBefore >= (int)allSegmentProgramCourses.size() ? (int)allSegmentProgramCourses.size() : legBefore);
		if (end >= (int)allSegmentProgramCourses.size()) end = (int)allSegmentProgramCourses.size();
	}
	//std::vector的迭代器范围遵循‌左闭右开‌原则
	return vector<std::shared_ptr<TmProgramCourse>>(allSegmentProgramCourses.begin() + start, allSegmentProgramCourses.begin() + end);
}

bool LimitLegAndStationForEvaFdRule::MatchLegPassenger(const std::shared_ptr<TmProgramCourse>& segmentProgramCourse, const string& legPassenger) const {
	string cargoFleet = "B77X";
	auto it = _dbData->systemParamMap.find("CARGO_FLIGHT_FLEET");//货机航班机型
	if (it != _dbData->systemParamMap.end()) {
		cargoFleet = it->second;
	}
	vector<string> cargoFleets;
	split(cargoFleet.c_str(), '|', cargoFleets);

	bool matched = true;
	if (legPassenger == "ALL") { //ALL-货机和客机
		matched = true;
	}
	else if (legPassenger == "CARGO FLIGHT") { //Cargo Flight：货机B77X
		matched = (std::find(cargoFleets.begin(), cargoFleets.end(), segmentProgramCourse->fleet) != cargoFleets.end());
	}
	else if (legPassenger == "PASSENGER FLIGHT") { //Passenger Flight：客机
		matched = (std::find(cargoFleets.begin(), cargoFleets.end(), segmentProgramCourse->fleet) == cargoFleets.end());
	}
	return matched;
}

void LimitLegAndStationForEvaFdRule::ParseParam(const InputType& input) {
	//add by hexd 添加DBRule支持
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(LimitLegAndStationForEvaFdRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}
	if (!_ruleParams.empty()) {
		return;
	}
	for (const auto& singleRuleParamString : input.ruleParamString) {
		_ruleParams.emplace_back(LimitLegAndStationForEvaFdRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(singleRuleParamString);
	}
}

inline static string GetLegStationOrGroupDesc(const string& legStation, const string& legGroup) {
	string legStationOrGroup = legStation;
	if (legStationOrGroup.empty()) {
		legStationOrGroup = legGroup;
	}
	else if (!legGroup.empty()) {
		legStationOrGroup += " " + legGroup;
	}
	return legStationOrGroup;
}

inline static string GetLegStationOrLegPassengerDesc(const string& legStation, const string& legPassenger) {
	string legStationOrLegPassenger = (legStation == "LEG" ? "leg range" : strToLower(legStation));
	if (!legPassenger.empty()) {
		legStationOrLegPassenger += "/" + strToLower(legPassenger);
	}
	return legStationOrLegPassenger;
}

inline static string GetLegForceDesc(const string& legForce) {
	//leg要求，取值：AnyOf 所有站点去一个即可、mustGo 所有站点必须都去 、mustNotGo 所有站点都不能去
	if (legForce == "ANYOF" || legForce == "GOTOONE") {
		return "any of";
	}
	else if (legForce == "MUSTGO") {
		return "must go";
	}
	else if (legForce == "MUSTNOTGO") {
		return "must not go";
	}
	return strToLower(legForce);
}

void LimitLegAndStationForEvaFdRule::ThrowRuleViolationForViaStation(const ActualLegStationCount& actualLegStationCount, const std::shared_ptr<TmProgramCourse>& tmProgramCourse, const vector<std::shared_ptr<TmProgramCourse>>& tmProgramCourseList, const std::shared_ptr<TmProgramCourseMore>& tmProgramCourseMore, const std::shared_ptr<TmProgramCourseMoreLeg>& tmProgramCourseMoreLeg) const {
	auto& dbData = this->GetDataContext();
	auto tmCourse = TrainingCourseUtils::GetCourseByCourseId(tmProgramCourse->courseId, dbData);
	auto tmProgram = dbData->tmProgramIndex->getById(tmProgramCourse->programId);

	//在训练计划课程的航班站点不满足需求
	//The program (A) leg number (N) (B) (C)does not meet the requirements(D)
	std::string msg;
	string legStationOrGroup = GetLegStationOrGroupDesc(tmProgramCourseMoreLeg->legStation, tmProgramCourseMoreLeg->legGroup);

	string legStationOrLegPassenger = GetLegStationOrLegPassengerDesc(tmProgramCourseMore->legStation, tmProgramCourseMoreLeg->legPassenger);

	if (tmProgramCourseMoreLeg->legRange == "BETWEEN") {
		//msg = "The program ({0:legCategory}) leg number ({1:actualLegCount}) ({2:legStation}/{3:legPassenger}) ({4:legRange} {5:legBefore}-{6:legAfter}) does not meet the requirements ({7:legSector})";
		msg = "The program ({0:courseCode}) leg number ({1:actualLegCount}) ({2:legStationOrLegPassenger}) ({3:legRange} {4:legBefore}-{5:legAfter}) ({6:legForce} {7:legStationOrGroup}) does not meet the requirements ({8:legSector}).";
		msg = StringUtils::Format(msg, tmCourse == nullptr ? "N/A" : tmCourse->courseCode, (tmProgramCourseMore->legStation == "STATION" ? actualLegStationCount.stationCountInStations : actualLegStationCount.legCountInStations),
			legStationOrLegPassenger, 
			strToLower(tmProgramCourseMoreLeg->legRange), tmProgramCourseMoreLeg->legBefore, tmProgramCourseMoreLeg->legAfter, GetLegForceDesc(tmProgramCourseMoreLeg->legForce), legStationOrGroup,
			tmProgramCourseMoreLeg->legSector);
	}
	else if (tmProgramCourseMoreLeg->legRange == "BEFORE" || tmProgramCourseMoreLeg->legRange == "AFTER") {
		msg = "The program ({0:courseCode}) leg number ({1:actualLegCount}) ({2:legStationOrLegPassenger}) ({3:legRange} {4:legBeforeOrlegAfter}) ({5:legForce} {6:legStationOrGroup}) does not meet the requirements ({7:legSector}).";
		msg = StringUtils::Format(msg, tmCourse == nullptr ? "N/A" : tmCourse->courseCode, (tmProgramCourseMore->legStation == "STATION" ? actualLegStationCount.stationCountInStations : actualLegStationCount.legCountInStations),
			legStationOrLegPassenger,
			strToLower(tmProgramCourseMoreLeg->legRange), (tmProgramCourseMoreLeg->legRange == "BEFORE" ? tmProgramCourseMoreLeg->legBefore : tmProgramCourseMoreLeg->legAfter), GetLegForceDesc(tmProgramCourseMoreLeg->legForce), legStationOrGroup,
			tmProgramCourseMoreLeg->legSector);
	}
	else {
		msg = "The program ({0:courseCode}) leg number ({1:actualLegCount}) ({2:legStationOrLegPassenger}) ({3:legForce} {4:legStationOrGroup}) does not meet the requirements ({5:legSector}).";
		msg = StringUtils::Format(msg, tmCourse == nullptr ? "N/A" : tmCourse->courseCode, (tmProgramCourseMore->legStation == "STATION" ? actualLegStationCount.stationCountInStations : actualLegStationCount.legCountInStations),
			legStationOrLegPassenger, GetLegForceDesc(tmProgramCourseMoreLeg->legForce), legStationOrGroup,
			tmProgramCourseMoreLeg->legSector);
	}

	RULE_VIOLATION* rv = new RULE_VIOLATION();
	if (_ruleViolation.GetRuleLegality() != nullptr) {
		_ruleViolation.GetRuleLegality()->isLegal = false;
		_ruleViolation.GetRuleLegality()->skipCheckInLaterIterations = true;

		SharedPtr<CREW> ppCrew = (this->_dbData->crewList[_ruleViolation.GetRuleLegality()->crewIndex]);
		rv->rosterId = -1;
		rv->crewId = ppCrew->idCrew;
		_ruleViolation.SetLegalityMessage(ppCrew, msg);
		rv->type = VIOLATION_TYPE::CREW_VIOLATION;
	}
	else {
		rv->type = VIOLATION_TYPE::PAIRING_VIOLATION;
	}

	rv->pairingId = -1;
	rv->startDTUtc = tmProgramCourseList.front()->startTime;
	rv->endDTUtc = tmProgramCourseList.back()->endTime;
	rv->violation_msg = msg;
	rv->operation_result.insert(pair<string, string>("programId", (tmProgram == nullptr ? "-1" : StringUtils::lltos(tmProgram->id))));
	rv->operation_result.insert(pair<string, string>("programName", (tmProgram == nullptr ? "N/A" : tmProgram->name)));
	rv->operation_result.insert(pair<string, string>("courseId", (tmCourse == nullptr ? "-1" : StringUtils::lltos(tmCourse->id))));
	rv->operation_result.insert(pair<string, string>("courseCode", (tmCourse == nullptr ? "N/A" : tmCourse->courseCode)));
	rv->operation_result.insert(pair<string, string>("tmProgramCourseMoreLegId", StringUtils::lltos(tmProgramCourseMoreLeg->id)));
	_ruleViolation.AddRuleViolations(rv);
}

void LimitLegAndStationForEvaFdRule::ThrowRuleViolationForLegSector(const ActualLegStationCount& actualLegStationCount, const std::shared_ptr<TmProgramCourse>& tmProgramCourse, const vector<std::shared_ptr<TmProgramCourse>>& tmProgramCourseList, const std::shared_ptr<TmProgramCourseMore>& tmProgramCourseMore, const std::shared_ptr<TmProgramCourseMoreLeg>& tmProgramCourseMoreLeg) const {
	auto& dbData = this->GetDataContext();
	auto tmCourse = TrainingCourseUtils::GetCourseByCourseId(tmProgramCourse->courseId, dbData);
	auto tmProgram = dbData->tmProgramIndex->getById(tmProgramCourse->programId);

	//在训练计划课程的Station数量不满足需求
	//The program (A) leg number (N) (B) (C)does not meet the requirements(D)

	string legStationOrLegPassenger = GetLegStationOrLegPassengerDesc(tmProgramCourseMore->legStation, tmProgramCourseMoreLeg->legPassenger);

	std::string msg;
	if (tmProgramCourseMoreLeg->legRange == "BETWEEN") {
		msg = "The program ({0:courseCode}) leg number ({1:actualLegCount}) ({2:legStationOrLegPassenger}) ({3:legRange} {4:legBefore}-{5:legAfter}) does not meet the requirements ({6:legSector}).";
		msg = StringUtils::Format(msg, tmCourse == nullptr ? "N/A" : tmCourse->courseCode, actualLegStationCount.legCount, legStationOrLegPassenger,
			strToLower(tmProgramCourseMoreLeg->legRange), tmProgramCourseMoreLeg->strLegBefore, tmProgramCourseMoreLeg->strLegAfter, tmProgramCourseMoreLeg->legSector);
	}
	else if (tmProgramCourseMoreLeg->legRange == "BEFORE" || tmProgramCourseMoreLeg->legRange == "AFTER") {
		msg = "The program ({0:courseCode}) leg number ({1:actualLegCount}) ({2:legStationOrLegPassenger}) ({3:legRange} {4:legBeforeOrlegAfter}) does not meet the requirements ({5:legSector}).";
		msg = StringUtils::Format(msg, tmCourse == nullptr ? "N/A" : tmCourse->courseCode, actualLegStationCount.legCount, legStationOrLegPassenger,
			strToLower(tmProgramCourseMoreLeg->legRange), (tmProgramCourseMoreLeg->legRange == "BEFORE" ? tmProgramCourseMoreLeg->legBefore : tmProgramCourseMoreLeg->legAfter), tmProgramCourseMoreLeg->legSector);
	}
	else {
		msg = "The program ({0:legCategory}) leg number ({1:actualLegCount}) ({2:legStationOrLegPassenger}) does not meet the requirements ({3:legSector}).";
		msg = StringUtils::Format(msg, tmCourse == nullptr ? "N/A" : tmCourse->courseCode, actualLegStationCount.legCount, legStationOrLegPassenger,
			  tmProgramCourseMoreLeg->legSector);

	}

	RULE_VIOLATION* rv = new RULE_VIOLATION();
	if (_ruleViolation.GetRuleLegality() != nullptr) {
		_ruleViolation.GetRuleLegality()->isLegal = false;
		_ruleViolation.GetRuleLegality()->skipCheckInLaterIterations = true;

		SharedPtr<CREW> ppCrew = (this->_dbData->crewList[_ruleViolation.GetRuleLegality()->crewIndex]);
		rv->rosterId = -1;
		rv->crewId = ppCrew->idCrew;
		_ruleViolation.SetLegalityMessage(ppCrew, msg);
		rv->type = VIOLATION_TYPE::CREW_VIOLATION;
	}
	else {
		rv->type = VIOLATION_TYPE::PAIRING_VIOLATION;
	}

	rv->pairingId = -1;
	rv->startDTUtc = tmProgramCourseList.front()->startTime;
	rv->endDTUtc = tmProgramCourseList.back()->endTime;
	rv->violation_msg = msg;
	rv->operation_result.insert(pair<string, string>("programId", (tmProgram == nullptr ? "-1" : StringUtils::lltos(tmProgram->id))));
	rv->operation_result.insert(pair<string, string>("programName", (tmProgram == nullptr ? "N/A" : tmProgram->name)));
	rv->operation_result.insert(pair<string, string>("courseId", (tmCourse == nullptr ? "-1" : StringUtils::lltos(tmCourse->id))));
	rv->operation_result.insert(pair<string, string>("courseCode", (tmCourse == nullptr ? "N/A" : tmCourse->courseCode)));
	rv->operation_result.insert(pair<string, string>("tmProgramCourseMoreLegId", StringUtils::lltos(tmProgramCourseMoreLeg->id)));
	_ruleViolation.AddRuleViolations(rv);
}

void LimitLegAndStationForEvaFdRule::ThrowRuleViolationForLegStation(const ActualLegStationCount& actualLegStationCount, const std::shared_ptr<TmProgramCourse>& tmProgramCourse, const vector<std::shared_ptr<TmProgramCourse>>& tmProgramCourseList, const std::shared_ptr<TmProgramCourseMore>& tmProgramCourseMore, const std::shared_ptr<TmProgramCourseMoreLeg>& tmProgramCourseMoreLeg) const {
	auto& dbData = this->GetDataContext();
	auto tmCourse = TrainingCourseUtils::GetCourseByCourseId(tmProgramCourse->courseId, dbData);
	auto tmProgram = dbData->tmProgramIndex->getById(tmProgramCourse->programId);

	//在训练计划课程的Station数量不满足需求
	//The program (A) leg number (N) (B) (C)does not meet the requirements(D)
	string legStationOrLegPassenger = GetLegStationOrLegPassengerDesc(tmProgramCourseMore->legStation, tmProgramCourseMoreLeg->legPassenger);

	std::string msg;
	if (tmProgramCourseMoreLeg->legRange == "BETWEEN") {
		msg = "The program ({0:courseCode}) leg number ({1:actualStationCount}) ({2:legStationOrLegPassenger) ({3:legRange} {4:legBefore}-{5:legAfter}) does not meet the requirements ({6:legSector}).";
		msg = StringUtils::Format(msg, tmCourse == nullptr ? "N/A" : tmCourse->courseCode, actualLegStationCount.stationCount, legStationOrLegPassenger,
			strToLower(tmProgramCourseMoreLeg->legRange), tmProgramCourseMoreLeg->legBefore, tmProgramCourseMoreLeg->legAfter, tmProgramCourseMoreLeg->legSector);
	}
	else if (tmProgramCourseMoreLeg->legRange == "BEFORE" || tmProgramCourseMoreLeg->legRange == "AFTER") {
		msg = "The program ({0:courseCode}) leg number ({1:actualStationCount}) ({2:legStationOrLegPassenger}) ({3:legRange} {4:legBeforeOrlegAfter}) does not meet the requirements ({5:legSector}).";
		msg = StringUtils::Format(msg, tmCourse == nullptr ? "N/A" : tmCourse->courseCode, actualLegStationCount.stationCount, legStationOrLegPassenger,
			strToLower(tmProgramCourseMoreLeg->legRange), (tmProgramCourseMoreLeg->legRange == "BEFORE" ? tmProgramCourseMoreLeg->legBefore : tmProgramCourseMoreLeg->legAfter), tmProgramCourseMoreLeg->legSector);
	}
	else {
		msg = "The program ({0:courseCode}) leg number ({1:actualStationCount}) ({2:legStationOrLegPassenger}) does not meet the requirements ({3:legSector}).";
		msg = StringUtils::Format(msg, tmCourse == nullptr ? "N/A" : tmCourse->courseCode, actualLegStationCount.stationCount, legStationOrLegPassenger,
			  tmProgramCourseMoreLeg->legSector);
	}

	RULE_VIOLATION* rv = new RULE_VIOLATION();
	if (_ruleViolation.GetRuleLegality() != nullptr) {
		_ruleViolation.GetRuleLegality()->isLegal = false;
		_ruleViolation.GetRuleLegality()->skipCheckInLaterIterations = true;

		SharedPtr<CREW> ppCrew = (this->_dbData->crewList[_ruleViolation.GetRuleLegality()->crewIndex]);
		rv->rosterId = -1;
		rv->crewId = ppCrew->idCrew;
		_ruleViolation.SetLegalityMessage(ppCrew, msg);
		rv->type = VIOLATION_TYPE::CREW_VIOLATION;
	}
	else {
		rv->type = VIOLATION_TYPE::PAIRING_VIOLATION;
	}

	rv->pairingId = -1;
	rv->startDTUtc = tmProgramCourseList.front()->startTime;
	rv->endDTUtc = tmProgramCourseList.back()->endTime;
	rv->violation_msg = msg;
	rv->operation_result.insert(pair<string, string>("programId", (tmProgram == nullptr ? "-1" : StringUtils::lltos(tmProgram->id))));
	rv->operation_result.insert(pair<string, string>("programName", (tmProgram == nullptr ? "N/A" : tmProgram->name)));
	rv->operation_result.insert(pair<string, string>("courseCode", (tmCourse == nullptr ? "N/A" : tmCourse->courseCode)));
	rv->operation_result.insert(pair<string, string>("tmProgramCourseMoreLegId", StringUtils::lltos(tmProgramCourseMoreLeg->id)));
	_ruleViolation.AddRuleViolations(rv);
}
