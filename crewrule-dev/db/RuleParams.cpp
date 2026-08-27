
#include "RuleParams.h"
#include <iostream>
#include <algorithm>
#include "RuleEngineDef.h"
#include "UtilFunc.h"
#include "StringUtil.h"
#include <ErrorCodeDef.h>
#include "../index/TmProgramIndex.h"

inline static std::shared_ptr<TmCourse> GetCourseByCourseId(const long long courseId, const std::shared_ptr<CrewDataContext>& dbData) {
	auto iter = dbData->tmCourseMap.find(courseId);
	if (iter == dbData->tmCourseMap.end()) {
		return nullptr;
	}
	return iter->second;
}

inline static bool MatchRoute(const Segment* segment, const vector<string>& routeCodes, const SharedPtr<CrewDataContext>& dbData) {
	if (routeCodes.empty()) {
		return false;
	}
	bool matchRoute = false;
	for (auto& route : dbData->routeList) {
		if (route->arvArp != "" && route->arvArp != segment->getArrStation())
			continue;
		if (route->depArp != "" && route->depArp != segment->getDepStation())
			continue;
		if (route->fltNum != "" && route->fltNum != segment->getFlightNumber())
			continue;
		Segment* flt = dbData->flightIdMap[segment->getDBId()].get();
		if (!flt)
			flt = const_cast<Segment*>(segment);
		if ((route->flt_dt_start != -1 && route->flt_dt_start > flt->getStartTimeLocAct()) || (route->flt_dt_end != -1 && route->flt_dt_end < flt->getEndTimeLocAct())) {
			continue;
		}
		if (route->segType != "" && route->segType != "*" && route->segType != flt->getDomIntType() && (route->flt_dt_start > flt->getStartTimeLocAct() || route->flt_dt_end < flt->getEndTimeLocAct()))
			continue;

		auto attrIter = dbData->attributeIdMap.find(route->routeId);
		if (attrIter != dbData->attributeIdMap.end() && find(routeCodes.begin(), routeCodes.end(), attrIter->second.code) != routeCodes.end()) {
			matchRoute = true;
			break;
		}
	}	
	return matchRoute;
}

//mantis#1715, 重构参数解析
//从参数map中按 paramName提取参数值，放入paramValue
//allowEmpty：是否允许为空
//mustNumber：是否必须数字
int retriveRuleParameter(const map<string, string>& params, string paramName, string& paramValue, bool allowEmpty, bool mustNumber) {
	if (params.find(paramName) == params.end())
		return ERR_RULE_PARAM_NOT_FOUND;
	auto it = params.find(paramName);
	if (it != params.end())
		paramValue = it->second;
	if (!allowEmpty && paramValue == "")
		return ERR_RULE_PARAM_EMPTY;
	if (mustNumber && !isNumberStr(paramValue.c_str(), paramValue.length()))
		return ERR_RULE_PARAM_NUMBER;
	return 0;
}

// 类的静态成员变量要在类体外进行定义
//RuleParams* RuleParams::m_pStatic = NULL;
RuleParams RuleParams::m_pStatic;
RuleParams RuleParams::m_pStaticOfP;
RuleParams RuleParams::m_pStaticOfC;
RuleParams RuleParams::m_pStaticOfA;
ThreadLocal<string> RuleParams::_division;
RuleParams* RuleParams::GetInstancePtr()
{
	//if (NULL == m_pStatic)
	//{
	//	m_pStatic = new RuleParams();
	//}
	//20190222 ain, 单例模式改为基于对象, 避免mem leak
	string& division = _division.get();
	if (division == "P") {
		return &m_pStaticOfP;
	}
	else if (division == "C") {
		return &m_pStaticOfC;
	}
	else if (division == "A") {
		return &m_pStaticOfA;
	}
	return &m_pStatic;
}

void RuleParams::setDivision(const string& division) {
	_division.set(division);
}

namespace {
std::string getPairingDivision(const Duty* duty, const SharedPtr<CrewDataContext>& dbData) {
	if (!dbData) {
		return "";
	}

	std::string pairingDivision = dbData->scenario.division;
	if (!pairingDivision.empty()) {
		return pairingDivision;
	}

	if (duty != nullptr) {
		auto itPairing = dbData->pairingIdMap.find(duty->getPairingId());
		if (itPairing != dbData->pairingIdMap.end() && itPairing->second != nullptr) {
			pairingDivision = itPairing->second->getDivision();
		}
	}

	return pairingDivision;
}

bool tryParseLongTransitTurnTimeRange(const string& value, int& lowerMins, int& upperMins) {
	if (value.empty() || value == "*" || value.find('-') == string::npos) {
		return false;
	}

	vector<string> splitValues;
	split(value, '-', splitValues);
	if (splitValues.size() != 2) {
		return false;
	}

	const string lower = trim(splitValues[0]);
	const string upper = trim(splitValues[1]);
	if (lower.empty() || upper.empty()) {
		return false;
	}

	lowerMins = hhmmToMinutes(lower.c_str());
	upperMins = hhmmToMinutes(upper.c_str());
	return true;
}

int getBriefValueByField(const rule3021* cache, const std::string& briefField) {
	if (cache == nullptr) {
		return -1;
	}

	if (briefField == RuleParams::DUTY_MAX_FDP_BRIEF_FIELD) {
		return cache->maxFdpBriefTime >= 0 ? cache->maxFdpBriefTime : cache->briefTime;
	}

	return cache->briefTime;
}

bool matchesRule3021(const Duty* duty,
	const SharedPtr<CrewDataContext>& dbData,
	const std::string& pairingBase,
	const rule3021* cache) {
	if (duty == nullptr || dbData == nullptr || cache == nullptr) {
		return false;
	}

	Segment* seg = duty->getFirstSegment();
	Segment* lastSeg = duty->getLastSegment();
	if (!seg) {
		return false;
	}

	const string& airport = cache->airport;
	const int depStart = cache->depStart;
	const int depEnd = cache->depEnd;
	const string& dutyType = cache->dutyType;
	const vector<string>& fltNumsVec = cache->fltNumsVec;
	const vector<string>& fleetsVec = cache->fleetsVec;
	const vector<string>& assignment = cache->assignment;
	const vector<string>& dutyAssignments = cache->dutyAssignments;
	const vector<string>& airlines = cache->airlines;
	const shared_ptr<bool>& isTraining = cache->isTraining;
	const time_t effDate = cache->effDate;
	const time_t expDate = cache->expDate;
	const vector<string>& courses = cache->courses;
	const int dutyBlhRangeLower = cache->dutyBlhRangeLower;
	const int dutyBlhRangeUpper = cache->dutyBlhRangeUpper;
	const int sectorBlhRangeLower = cache->sectorBlhRangeLower;
	const int sectorBlhRangeUpper = cache->sectorBlhRangeUpper;
	const string& endAirport = cache->endAirport;
	const vector<string>& routes = cache->routes;
	const vector<string>& pairingBases = cache->pairingBases;

	if (airport != "*" && seg->getDepStation() != airport) {
		return false;
	}
	if (endAirport != "*" && lastSeg && lastSeg->getArrStation() != endAirport) {
		return false;
	}
	const int time = seg->getStartTimeLocAct() % (60 * 60 * 24);
	if (depStart > 0 && time < depStart) {
		return false;
	}
	if (depEnd > 0 && time > depEnd) {
		return false;
	}
	if ((expDate != -1 && seg->getStartTimeLocAct() > expDate + 24 * 3600 - 1) || (effDate != -1 && seg->getStartTimeLocAct() < effDate)) {
		return false;
	}
	if (dutyType != "*" && seg->getDomIntType() != dutyType) {
		return false;
	}
	if (!fltNumsVec.empty() && fltNumsVec[0] != "*" && find(fltNumsVec.begin(), fltNumsVec.end(), seg->getFlightNumber()) == fltNumsVec.end()) {
		return false;
	}
	if (!fleetsVec.empty() && fleetsVec[0] != "*" && find(fleetsVec.begin(), fleetsVec.end(), seg->getFleetCD()) == fleetsVec.end()) {
		return false;
	}
	if (!assignment.empty() && assignment[0] != "*" && find(assignment.begin(), assignment.end(), seg->getAssignment()) == assignment.end()) {
		return false;
	}
	if (!dutyAssignments.empty() && dutyAssignments[0] != "*" && find(dutyAssignments.begin(), dutyAssignments.end(), duty->getAssignment()) == dutyAssignments.end()) {
		return false;
	}
	if (!airlines.empty() && airlines[0] != "*" && find(airlines.cbegin(), airlines.cend(), seg->getAirline()) == airlines.cend()) {
		return false;
	}
	if (isTraining != nullptr && duty->isTrainingAddTime() != *isTraining) {
		return false;
	}
	if (!routes.empty() && !MatchRoute(seg, routes, dbData)) {
		return false;
	}
	if (!pairingBases.empty() && std::find(pairingBases.begin(), pairingBases.end(), pairingBase) == pairingBases.end()) {
		return false;
	}
	if (!courses.empty() && courses[0] != "*" && courses[0] != "") {
		auto& tmProgramCourseIndex = dbData->tmProgramCourseIndex;
		auto& tmProgramCourseInstructorIndex = dbData->tmProgramCourseInstructorIndex;
		bool findCourse = false;
		for (const auto& dutySeg : duty->getSegmentsRead()) {
			const auto& rfs = dbData->rosterFlightMgr.get(dutySeg->getDBId());
			if (rfs.empty()) {
				continue;
			}
			if (findCourse) {
				break;
			}
			for (const auto& rf : rfs) {
				if (rf->dutyId == duty->getDutyId()) {
					const auto programCourse = tmProgramCourseIndex->getByRosterId(rf->rosterId, dutySeg->getDBId());
					if (programCourse != nullptr) {
						const auto courseCode = GetCourseByCourseId(programCourse->courseId, dbData);
						if (find(courses.begin(), courses.end(), courseCode->courseCode) != courses.end()) {
							findCourse = true;
							break;
						}
					}
					const auto programCourseInstructor = tmProgramCourseInstructorIndex->getByRosterId(rf->rosterId, dutySeg->getDBId());
					if (programCourseInstructor != nullptr) {
						const auto instructorCourseCode = GetCourseByCourseId(programCourseInstructor->courseId, dbData);
						if (find(courses.begin(), courses.end(), instructorCourseCode->courseCode) != courses.end()) {
							findCourse = true;
							break;
						}
					}
				}
			}
		}
		if (!findCourse) {
			return false;
		}
	}

	if (dutyBlhRangeLower > 0 || dutyBlhRangeUpper > 0) {
		int blh = 0;
		for (const auto& dutySeg : duty->getSegmentsRead()) {
			blh += dutySeg->getBlkMinutes();
		}
		if (dutyBlhRangeLower > 0 && blh < dutyBlhRangeLower) {
			return false;
		}
		if (dutyBlhRangeUpper > 0 && blh > dutyBlhRangeUpper) {
			return false;
		}
	}

	if (sectorBlhRangeLower == 0 && sectorBlhRangeUpper == 0) {
		return true;
	}

	for (const auto& dutySeg : duty->getSegmentsRead()) {
		if (dutySeg->getBlkMinutes() >= sectorBlhRangeLower && (sectorBlhRangeUpper == 0 || dutySeg->getBlkMinutes() <= sectorBlhRangeUpper)) {
			return true;
		}
	}
	return false;
}
}

bool RuleParams::matchLongTransitMaxTurnTime(const long transitMins, const long_transit* longTransit) {
	if (longTransit == nullptr) {
		return false;
	}

	if (longTransit->hasMaxTurnTimeRange) {
		return transitMins >= longTransit->maxTurnTimeMins
			&& transitMins <= longTransit->maxTurnTimeUpperMins;
	}

	return transitMins >= longTransit->maxTurnTimeMins;
}

int RuleParams::CalculateDutyBrief(const Duty* duty, const SharedPtr<CrewDataContext>& dbData, const string& pairingBase, const string& briefField) {
	if (duty == nullptr || dbData == nullptr) {
		return -1;
	}

	auto& dutyBuilder = dbData->getRuleFunctions(RULES::CHECK_IN_OUT_BRIEF);
	std::string pairingDivision = getPairingDivision(duty, dbData);

	for (std::size_t i = 0; i < dutyBuilder.size(); i++) {
		rule3021* cache = (rule3021*)dutyBuilder[i].parsedParam.get();
		if (cache == nullptr) {
			continue;
		}

		if (!cache->division.empty() && cache->division != "*"
			&& !pairingDivision.empty() && cache->division != pairingDivision) {
			continue;
		}

		if (!matchesRule3021(duty, dbData, pairingBase, cache)) {
			continue;
		}

		return getBriefValueByField(cache, briefField);
	}
	return -1;
}

int RuleParams::GetMaxFdpBriefDeltaMinutes(const Duty* duty, const SharedPtr<CrewDataContext>& dbData, const string& pairingBase) {
	if (duty == nullptr || dbData == nullptr) {
		return 0;
	}

	auto& dutyBuilder = dbData->getRuleFunctions(RULES::CHECK_IN_OUT_BRIEF);
	const std::string pairingDivision = getPairingDivision(duty, dbData);

	for (std::size_t i = 0; i < dutyBuilder.size(); i++) {
		const rule3021* cache = static_cast<const rule3021*>(dutyBuilder[i].parsedParam.get());
		if (cache == nullptr) {
			continue;
		}

		if (!cache->division.empty() && cache->division != "*"
			&& !pairingDivision.empty() && cache->division != pairingDivision) {
			continue;
		}

		if (!matchesRule3021(duty, dbData, pairingBase, cache)) {
			continue;
		}

		if (cache->maxFdpBriefTime < 0) {
			return 0;
		}

		return cache->briefTime - cache->maxFdpBriefTime;
	}
	return 0;
}

void RuleParams::ApplyMaxFdpBriefDeltaToDuty(Duty* duty, const SharedPtr<CrewDataContext>& dbData, const string& pairingBase) {
	if (duty == nullptr || dbData == nullptr) {
		return;
	}

	const int deltaMinutes = GetMaxFdpBriefDeltaMinutes(duty, dbData, pairingBase);
	if (deltaMinutes == 0) {
		return;
	}

	const int currentMaxFdp = duty->getLimitationValue(RULE_LIMITATION_TYPE::MAX_FDP);
	if (currentMaxFdp <= 0) {
		return;
	}

	limitaions* limit = duty->getLimiation(RULE_LIMITATION_TYPE::MAX_FDP);
	if (limit == nullptr) {
		return;
	}

	duty->setLimitationValue(
		RULE_LIMITATION_TYPE::MAX_FDP,
		currentMaxFdp + deltaMinutes,
		limit->last_set_rule,
		limit->ruleParamId,
		limit->overrideAbility,
		limit->classType,
		limit->description,
		limit->reference,
		true);
}

void RuleParams::setApplication(int iApp = ROSTER_EDITOR)
{
	_application = iApp;
}

int RuleParams::getApplication() const {
	return _application;
}

int RuleParams::getLongTransitRest(vector<Segment *> segments)
{
	int retu = 0;
	if (this->split_duty.size() > 0)
	{
		int size = (int)segments.size();
		//segments[size - 1]->setLongTransit(false);
		for (int i = 0; i + 1 < (int)segments.size(); ++i)
		{
			auto seg = segments[i];
			auto next_seg = segments[i + 1];
			auto longTransit = getLongTransit(seg, next_seg);
			if (longTransit == nullptr)
				continue;
			int transit = static_cast<int>(next_seg->getStartTimeUtcAct() - seg->getEndTimeUtcAct()) / 60;
			int rest = transit - longTransit->pseudoCI - longTransit->pseudoCO - longTransit->pseudoPickup - longTransit->pseudoDropoff;

			retu += rest;

			//string curr_assignment = segments[i]->getAssignment();
			//string next_assignment = segments[i + 1]->getAssignment();

			//int transit = static_cast<int>(segments[i + 1]->getStartTimeUtcAct() - segments[i]->getEndTimeUtcAct()) / 60;
			//int retuu = 0;
			//for (auto longTransit : split_duty)
			//{		
			//	int rest = 0;
			//	if (longTransit->inbound != segments[i]->getDomIntType() && longTransit->inbound != "*")
			//		continue;
			//	if (longTransit->outbound != segments[i + 1]->getDomIntType() && longTransit->outbound != "*")
			//		continue;

			//	if (longTransit->airport != "*" && longTransit->airport != segments[i]->getArrStation()){
			//		continue;
			//	}
			//	if (longTransit->fleetsVec[0] != "*"
			//		&&find(longTransit->fleetsVec.begin(), longTransit->fleetsVec.end(), segments[i]->getFleetCD()) == longTransit->fleetsVec.end()){
			//		continue;
			//	}
			//	int pickup = longTransit->pickUp, dropoff = longTransit->dropOff;
			//	if (segments[i]->getSplitDutyDropOffMin() != 0) dropoff = segments[i]->getSplitDutyDropOffMin();
			//	if (segments[i]->getSplitDutyPickUpMin() != 0) pickup = segments[i]->getSplitDutyPickUpMin();
			//	int actRest = transit - longTransit->pseudoCI - longTransit->pseudoCO - pickup - dropoff;
			//	if ((transit >= longTransit->maxTurnTimeMins) && (actRest) > 0)
			//	{
			//		if (longTransit->in_assignment != "*" && longTransit->in_assignment != curr_assignment)
			//			continue;
			//		if (longTransit->out_assignment != "*" && longTransit->out_assignment != next_assignment)
			//			continue;
			//		rest = actRest;
			//		//segments[i]->setLongTransit(true);
			//		//segments[i]->setLongTransitRestMins(actRest);
			//		rest += pickup + dropoff;
			//		//mantis#5570 新增适配brief debrief
			//		//if (!bIncludeCO)
			//		//mantis#8766, 长中转需FDP需计算 debrief, 为与duty brief区分单独设置参数bIncludeLongTransitCO
			//		if (!bIncludeLongTransitCO)
			//		{
			//			rest += longTransit->pseudoCO;
			//		}
			//		if (!bIncludeCI)
			//		{
			//			rest += longTransit->pseudoCI;
			//		}
			//		//mantis#5570 需要能够覆盖 按照最后一条参数生效
			//		//break;
			//	}
			//	retuu = rest;
			//}
			//retu += retuu;
		}
	}
	return retu;
}

bool RuleParams::isLongTransit(const Duty* duty) {
	for (int i = 0; i < (int)duty->getSegments().size() - 1; i++) {
		Segment* currSegment = duty->getSegment(i);
		Segment* nextSegment = duty->getSegment(i+1);
		long_transit* longTransit = getLongTransit(currSegment, nextSegment);
		if (longTransit != nullptr) {
			return true;
		}
	}
	return false;
}

bool RuleParams::isTransit(const Duty* duty) {
	for (int i = 0; i < (int)duty->getSegments().size() - 1; i++) {
		Segment* currSegment = duty->getSegment(i);
		Segment* nextSegment = duty->getSegment(i + 1);
		long_transit* transit = getTransit(currSegment, nextSegment);
		if (transit != nullptr) {
			return true;
		}
	}
	return false;
}

//2102配置顺序按 条件宽松在前、条件收紧在后
//从前到后遍历 2102每一行，找到最后一条匹配的记录
//一次性完成判断是否长中转、找到brief|debrief，避免反复遍历 long_transit列表
long_transit* RuleParams::getTransit(Segment*& segment1, Segment*& segment2)
{
	if (!segment1 || !segment2) {
		return nullptr;
	}
	long_transit* result = nullptr;
	int selectedLowerBoundMins = -1;
	if (this->split_duty.size() > 0)
	{
		//segment1->setLongTransit(false);
		//segment1->setLongTransitRestMins(0);
		string curr_assignment = segment1->getAssignment();
		string next_assignment = segment2->getAssignment();

		int transit = static_cast<int>(segment2->getStartTimeUtcAct() - segment1->getEndTimeUtcAct()) / 60;
		for (auto longTransit : split_duty)
		{
			if (longTransit->inbound != segment1->getDomIntType() && longTransit->inbound != "*")
				continue;
			if (longTransit->outbound != segment2->getDomIntType() && longTransit->outbound != "*")
				continue;

			if (longTransit->airport != "*" && longTransit->airport != segment1->getArrStation()){
				continue;
			}
			if (longTransit->fleetsVec[0] != "*"
				&&find(longTransit->fleetsVec.begin(), longTransit->fleetsVec.end(), segment1->getFleetCD()) == longTransit->fleetsVec.end()){
				continue;
			}
			int actRest = transit - longTransit->pseudoCI - longTransit->pseudoCO - longTransit->pseudoPickup - longTransit->pseudoDropoff;
			//配比多条longTransit，则返回longTransit->maxTurnTimeMins最大的对应的规则
			if (matchLongTransitMaxTurnTime(transit, longTransit) && (actRest) > 0 && longTransit->maxTurnTimeMins >= selectedLowerBoundMins)
			{
				//segment1->setLongTransit(true);
				if (longTransit->in_assignment != "*" && longTransit->in_assignment != curr_assignment)
					continue;
				if (longTransit->out_assignment != "*" && longTransit->out_assignment != next_assignment)
					continue;
				result = longTransit;
				selectedLowerBoundMins = longTransit->maxTurnTimeMins;
			}
		}
	}
	return result;
}

long_transit* RuleParams::getLongTransit(Segment*& segment1, Segment*& segment2) {
	long_transit* transit = RuleParams::getTransit(segment1, segment2);
	if (transit == nullptr || !transit->isSplitDuty) {
		return nullptr;
	}
	return transit;
}

//2102配置顺序按 条件宽松在前、条件收紧在后
//从前到后遍历 2102每一行，找到最后一条匹配的记录，返回brief
//int RuleParams::getLongTransitBrief(Segment*& segment1, Segment*& segment2)
//{
//	int brief = 0;
//	if (this->split_duty.size() > 0)
//	{
//		segment1->setLongTransit(false);
//		segment1->setLongTransitRestMins(0);
//		string curr_assignment = segment1->getAssignment();
//		string next_assignment = segment2->getAssignment();
//
//		int transit = static_cast<int>(segment2->getStartTimeUtcAct() - segment1->getEndTimeUtcAct()) / 60;
//		for (auto longTransit : split_duty)
//		{
//			if (longTransit->inbound != segment1->getDomIntType() && longTransit->inbound != "*")
//				continue;
//			if (longTransit->outbound != segment2->getDomIntType() && longTransit->outbound != "*")
//				continue;
//
//			if (longTransit->airport != "*" && longTransit->airport != segment1->getArrStation()){
//				continue;
//			}
//			if (longTransit->fleetsVec[0] != "*"
//				&&find(longTransit->fleetsVec.begin(), longTransit->fleetsVec.end(), segment1->getFleetCD()) == longTransit->fleetsVec.end()){
//				continue;
//			}
//			int pickup = longTransit->pickUp, dropoff = longTransit->dropOff;
//			int actRest = transit - longTransit->pseudoCI - longTransit->pseudoCO - pickup - dropoff;
//			if ((transit >= longTransit->maxTurnTimeMins) && (actRest) > 0)
//			{
//				segment1->setLongTransit(true);
//				if (longTransit->in_assignment != "*" && longTransit->in_assignment != curr_assignment)
//					continue;
//				if (longTransit->out_assignment != "*" && longTransit->out_assignment != next_assignment)
//					continue;
//				//mantis#5570 新增适配brief debrief
//				if (bIncludeCI)
//				{
//					brief = longTransit->pseudoCI;
//				}
//				//mantis#5570 需要能够覆盖 按照最后一条参数生效
//				//break;
//			}
//		}
//	}
//	return brief;
//}

//2102配置顺序按 条件宽松在前、条件收紧在后
//从前到后遍历 2102每一行，找到最后一条匹配的记录，返回debrief
//int RuleParams::getLongTransitDebrief(Segment*& segment1, Segment*& segment2)
//{
//	int debrief = 0;
//	if (this->split_duty.size() > 0)
//	{
//		segment1->setLongTransit(false);
//		segment1->setLongTransitRestMins(0);
//		string curr_assignment = segment1->getAssignment();
//		string next_assignment = segment2->getAssignment();
//
//		int transit = static_cast<int>(segment2->getStartTimeUtcAct() - segment1->getEndTimeUtcAct()) / 60;
//		
//		for (auto longTransit : split_duty)
//		{
//			if (longTransit->inbound != segment1->getDomIntType() && longTransit->inbound != "*")
//				continue;
//			if (longTransit->outbound != segment2->getDomIntType() && longTransit->outbound != "*")
//				continue;
//
//			if (longTransit->airport != "*" && longTransit->airport != segment1->getArrStation()){
//				continue;
//			}
//			if (longTransit->fleetsVec[0] != "*"
//				&&find(longTransit->fleetsVec.begin(), longTransit->fleetsVec.end(), segment1->getFleetCD()) == longTransit->fleetsVec.end()){
//				continue;
//			}
//			int pickup = longTransit->pickUp, dropoff = longTransit->dropOff;
//			int actRest = transit - longTransit->pseudoCI - longTransit->pseudoCO - pickup - dropoff;
//			if ((transit >= longTransit->maxTurnTimeMins) && (actRest) > 0)
//			{
//				segment1->setLongTransit(true);
//				if (longTransit->in_assignment != "*" && longTransit->in_assignment != curr_assignment)
//					continue;
//				if (longTransit->out_assignment != "*" && longTransit->out_assignment != next_assignment)
//					continue;
//				
//				//mantis#5570 新增适配brief debrief
//				if (bIncludeLongTransitCO)
//				{
//					debrief = longTransit->pseudoCO;
//				}
//				//mantis#5570 需要能够覆盖 按照最后一条参数生效
//				//break;
//			}
//
//		}
//	}
//	return debrief;
//}
void RuleParams::calculateSegPickUpAndDropOff(Segment* segment, vector<DBAirport> * airportList){
	// 这个函数对于同一个segment写入值是确定的，因此在duty层面调用这个函数是线程安全的
	if (this->split_duty.size() > 0)
	{
		if (segment->getSplitDutyPickUpMin() != 0 && segment->getSplitDutyDropOffMin() != 0)return;
		for (auto longTransit : split_duty)
		{
			if (longTransit->inbound != Utility::GetInstancePtr()->getAirportType(airportList, segment->getDepStation()) && longTransit->inbound != "*")
				continue;
			if (longTransit->outbound != Utility::GetInstancePtr()->getAirportType(airportList, segment->getArrStation()) && longTransit->outbound != "*")
				continue;

			if (longTransit->airport != "*" && longTransit->airport != segment->getArrStation()){
				continue;
			}
			if (longTransit->fleetsVec[0] != "*"
				&&find(longTransit->fleetsVec.begin(), longTransit->fleetsVec.end(), segment->getFleetCD()) == longTransit->fleetsVec.end()){
				continue;
			}
			segment->setSplitDutyDropOffMin(longTransit->pseudoDropoff);
			segment->setBriefTimeInsec(longTransit->pseudoCI * 60);
			segment->setDeBriefTimeInsec(longTransit->pseudoCO * 60);
			segment->setSplitDutyPickUpMin(longTransit->pseudoPickup);

			break;
		}
	}
}

void RuleParams::loadRuleParams(SharedPtr<CrewDataContext> _data)
{
	_assignmentNameMap = _data->assignmentNameMap;
	loadRuleParams_internal(_data);
	//basic definitions
	string div = _data->scenario.division;

	vector<RANK>& ranks=_data->rankList;

	for (auto& rank : ranks)
	{
		if (rank.division == "P" && rank.airline == _data->scenario.airline)
			fdRanks.push_back(rank.rank);
	}

	if (_data->systemParamMap.find("DELAY BUFFER") != _data->systemParamMap.end())
		delayMinutes =stoi(_data->systemParamMap["DELAY BUFFER"]);

	map<string, string>::iterator iter;
	map<string, string> parameter;
	string header, headeValue;

	auto rules = _data->getRuleFunctions(BASIC_DEFINITION);	
	for (auto rule : rules)
	{
		/*
		isFDPAugAllowedWhileBLHNotAug,N
		isPickupCount,N
		isDropOffCount,N
		isPreFerryCount,Y
		isPostFerryCount,N
		*/
		parameter = rule.params;
		string definition = "";
		string division = "C";
		for (iter = parameter.begin(); iter != parameter.end(); ++iter)
		{
			header = trim(iter->first);
			headeValue = trim(iter->second);
			/*FDP Definition*/
			if (header == "DEFINITION")
				definition = headeValue;
			if (header == "DIVISION")
				division = headeValue;
			if (header == "VALUE" && (division == div || div == "" || division == "*"))
			{
				if (definition == "IS FDP AUG ALLOWED WHILE BLH NOT AUG")
					bAugAllowed = (headeValue == "Y");
				if (definition == "IS PICKUP COUNT")
					bPickupCount = (headeValue == "Y");
				if (definition == "IS DROPOFF COUNT")
					bDropoffCount = (headeValue == "Y");
				if (definition == "IS PRE-FERRY COUNT")
					bPreFerryCount = (headeValue == "Y");
				if (definition == "IS POST-FERRY COUNT")
					bIncludeLastDHD = (headeValue == "Y");
				if (definition == "INCLUDE CHECK OUT")
					bIncludeCO = (headeValue == "Y");
				if (definition == "INCLUDE CHECK IN")
					bIncludeCI = (headeValue == "Y");
				if (definition == "INCLUDE LT CHECK OUT")
					bIncludeLongTransitCO = (headeValue == "Y");
				if (definition == "INCLUDE LT CHECK IN")
					bIncludeLongTransitCI = (headeValue == "Y");
				if (definition == "IS LT PICKUP COUNT")
					bIncludeLongTransitPickup = (headeValue == "Y");
				if (definition == "IS LT DROPOFF COUNT")
					bIncludeLongTransitDropoff = (headeValue == "Y");
				if (definition == "INCLUDE BREAK")
					bIncludeLongTransitBreak = (headeValue == "Y");
				if (definition == "USE STICK TIME")
					bUseStickTime = (headeValue == "Y");
				if (definition == "FIXED EXTENSTION")
					iFixedValueToFDP = stoi(headeValue);
				if (definition == "POST_ACTIVITY_THRESHOLD")
					postActivityThreshold = stoi(headeValue);
				if (definition == "FIXED BEFORE EXTENSTION")
					beforeFixValueToFDP = stoi(headeValue);
				if (definition == "MIN CONNECTION TIME")
					minConnectionTimeMinutes = stoi(headeValue);
				if (definition == "IS PRE-CSB COUNT")
					bIncludePreSBY = (headeValue == "Y");
				if (definition == "IS POST-CSB COUNT")
					bIncludePostSBY = (headeValue == "Y");
				if (definition == "IS PRE-GROUND COUNT")
					bIncludePreGround = (headeValue == "Y");
				if (definition == "IS POST-GROUND COUNT")
					bIncludePostGround = (headeValue == "Y");
				if (definition == "IS PRE-STAY COUNT")
					bIncludePreStay = (headeValue == "Y");
				if (definition == "IS POST-STAY COUNT")
					bIncludePostStay = (headeValue == "Y");
				if (definition == "IS PRE-HSB COUNT")
					bIncludePreHSB = (headeValue == "Y");
				if (definition == "IS POST-HSB COUNT")
					bIncludePostHSB = (headeValue == "Y");
			}
		}
	}

	rules = _data->getRuleFunctions(CALC_DHD_DP_FOR_RP);
	for (auto rule : rules)
	{
		parameter = rule.params;
		for (iter = parameter.begin(); iter != parameter.end(); ++iter)
		{
			header = trim(iter->first);
			headeValue = trim(iter->second);
			if (header == "FLIGHT ASSIGNMENTS") {
				if (!headeValue.empty() && headeValue != "*") {
					split(headeValue, '|', dpDefinition.dpAssignments);
				}
			}
			else if (header == "FLIGHT HOURS") {
				dpDefinition.flightHours = hhmmStrToMinutes(headeValue);
			}
			else if (header == "DP ADJUST PCT") {
				dpDefinition.dpPct = atof(headeValue.c_str());
			}
			else if (header == "CALLOUT ASSIGNMENTS") {
				if (!headeValue.empty() && headeValue != "*") {
					split(headeValue, '|', dpDefinition.calloutAssignments);
				}
			}
			else if (header == "DIR") {
				if (!headeValue.empty() && headeValue != "*") {
					split(headeValue, '|', dpDefinition.domIntTypes);
				}
			}
			else if (header == "SERVICE TYPE" || header == "SERVICE TYPES") {
				if (!headeValue.empty() && headeValue != "*") {
					split(headeValue, '|', dpDefinition.serviceTypes);
				}
			}
		}
	}

	rules = _data->getRuleFunctions(MAX_TRANSIT);
	/*DIVISION,INBOUND,OUTBOUND,MAX TURNTIME*/
	for (auto rule : rules)
	{
		parameter = rule.params;
		string division = "C";
		string definition = "";
		
		string inbound, outbound, in_assignment = "*", out_assignment = "*", airport, fleets = "*";
		int maxTurnTimeMins = 60 * 24 * 5, maxTurnTimeUpperMins = -1, pseudoCI = 30, pseudoCO = 30, pseudoPickup = 0, pseudoDropoff = 0;
		bool hasMaxTurnTimeRange = false;
		bool isSplitDuty = true;
		vector<string> fleetsVec;
		for (iter = parameter.begin(); iter != parameter.end(); ++iter)
		{
			header = trim(iter->first);
			headeValue = trim(iter->second);
			if (header == "AIRPORT")
				airport = headeValue;
			if (header == "DIVISION")
				division = headeValue;
			/*FDP Definition*/
			if (header == "INBOUND")
				inbound = headeValue;
			if (header == "OUTBOUND")
				outbound = headeValue;
			if (header == "IN ASSIGNMENT")
				in_assignment = headeValue;
			if (header == "OUT ASSIGNMENT")
				out_assignment = headeValue;
			if (header == "MAX TURNTIME") {
				hasMaxTurnTimeRange = tryParseLongTransitTurnTimeRange(headeValue, maxTurnTimeMins, maxTurnTimeUpperMins);
				if (!hasMaxTurnTimeRange) {
					maxTurnTimeMins = hhmmToMinutes(headeValue.c_str());
					maxTurnTimeUpperMins = -1;
				}
			}
			if (header == "PSEUDO BRIEF")
				pseudoCI = hhmmToMinutes(headeValue.c_str());
			if (header == "PSEUDO DEBRIEF")
				pseudoCO = hhmmToMinutes(headeValue.c_str());
			if (header == "PSEUDO PICK UP")
				pseudoPickup = hhmmToMinutes(headeValue.c_str());
			if (header == "PSEUDO DROP OFF")
				pseudoDropoff = hhmmToMinutes(headeValue.c_str());
			if (header == "PICK UP") //same as "PSEUDO PICK UP"
				pseudoPickup = hhmmToMinutes(headeValue.c_str());
			if (header == "DROP OFF") //same as "PSEUDO DROP OFF"
				pseudoDropoff = hhmmToMinutes(headeValue.c_str());
			if (header == "IS SPLIT DUTY") {
				isSplitDuty = (strToUpper(headeValue) == "Y");
			}
			if (header == "FLEETS"){
				fleets = headeValue;
			}
		}
		if (division == div || div == "" || division == "*")
		{
			long_transit* longTransit = new long_transit();
			longTransit->airport = airport;
			longTransit->division = division;
			longTransit->inbound = inbound;
			longTransit->outbound = outbound;
			longTransit->in_assignment = in_assignment;
			longTransit->out_assignment = out_assignment;
			longTransit->maxTurnTimeMins = maxTurnTimeMins;
			longTransit->maxTurnTimeUpperMins = maxTurnTimeUpperMins;
			longTransit->hasMaxTurnTimeRange = hasMaxTurnTimeRange;
			longTransit->pseudoCI = pseudoCI;
			longTransit->pseudoCO = pseudoCO;
			longTransit->pseudoPickup = pseudoPickup;
			longTransit->pseudoDropoff = pseudoDropoff;
			longTransit->isSplitDuty = isSplitDuty;
			split(fleets, '|', longTransit->fleetsVec);
			split_duty.push_back( longTransit);
		}
	}

	rules = _data->getRuleFunctions(LONG_TRANSIT_LIMITATION);
	for (auto& rule : rules)
	{
		//mantis#6176, 2019删除下层表，上层表由横向存储改为纵向存储
		parameter = rule.params;
		string strDefinition, strValue;
		for (iter = parameter.begin(); iter != parameter.end(); ++iter)
		{
			header = trim(iter->first);
			transform(header.begin(), header.end(), header.begin(), ::toupper);
			headeValue = trim(iter->second);
			transform(headeValue.begin(), headeValue.end(), headeValue.begin(), ::toupper);
			if (header == "DEFINITION")
				strDefinition = headeValue;
			if (header == "VALUE")
				strValue = headeValue;
		}

		if (strDefinition == "MAX TIMES PER DUTY")
		{
			r2109_maxPerDuty = atoi(strValue.c_str());
		}
		else if (strDefinition == "MAX TIMES PER PAIRING")
		{
			r2109_maxPerPairing = atoi(strValue.c_str());
		}
		else if (strDefinition == "ALLOWED START TIME")
		{
			r2109_startTime = hhmmToMinutes(strValue.c_str());
		}
		else if (strDefinition == "ALLOWED END TIME")
		{
			r2109_endTime = hhmmToMinutes(strValue.c_str());
		}
		//mantis#5582 2109有两组数据 所以会产生误告警
		//else
		//{
		//	printf("2109: Wrong Parameter.");
		//}			
	}

	rules = _data->getRuleFunctions(BUNK_SETTING);
	for (auto rule : rules)
	{
		//TABLE1HEADER:FLEET,BUNK_NUMBER,FILTER_FLIGHT,FLEET_GROUP
		//TABLE2HEADER:COMB,ALLOWABLE_FLEET_MIX
		parameter = rule.params;
		string fleet="";
		int bunk_num=0;
		for (iter = parameter.begin(); iter != parameter.end(); ++iter)
		{
			header = trim(iter->first);
			headeValue = trim(iter->second);
			if (rule.tableNum == 1)
			{
				if (header == "FLEET")
					fleet = headeValue;
				if (header == "BUNK_NUMBER")
					bunk_num =stoi(headeValue);
			}

		}
		if (fleet.size()>0 && bunk_num >0)
			rest_bunk.insert(make_pair(fleet,bunk_num));
	}

	rules = _data->getRuleFunctions(AIRPORT_RESTRICT);
	for (auto& rule : rules)
	{
		//AIRPORT, RESTRICT AC CHANGE, RESTRICT LONG TRANSIT, RESTRICT LAYOVER
		string airport;
		parameter = rule.params;
		for (iter = parameter.begin(); iter != parameter.end(); ++iter)
		{
			header = trim(iter->first);
			headeValue = trim(iter->second);
			if (header == "AIRPORT")
			{
				airport = headeValue;
			}
			if (header == "RESTRICT AC CHANGE" && airport.size()>0)
			{
				if (airport != "*")
				{
					if (headeValue == "Y")
						noACChanges.push_back(airport);
					else
						allowACChanges.push_back(airport);
				}					
				else
					restrictAllAirportInACChange = headeValue;
			}
			if (header == "RESTRICT LONG TRANSIT" && airport.size()>0)
			{
				if (airport != "*")
				{
					if (headeValue == "Y")
						noLongTransits.push_back(airport);
					else
						allowLongTransits.push_back(airport);
				}
				else
					restrictAllAirportInLongTransit = headeValue;
			}
			if (header == "RESTRICT LAYOVER" && airport.size()>0)
			{
				if (airport != "*")
				{
					if (headeValue == "Y")
						noLayovers.push_back(airport);
					else
						allowLayovers.push_back(airport);
				}
				else
					restrictAllAirportInLayover = headeValue;
			}
		}
	}

	for (auto& base : _data->baseList)
	{
		if (base.airline == _data->scenario.airline)
		{
			bases.push_back(base.base);
		}
	}
}

void RuleParams::loadRuleParams_internal(SharedPtr<CrewDataContext> _data)
{

	vector<int>& modes = _data->scenario.runMode;
	/*
	1、rule读取scenario数据，用run_modes_ids控制是否允许生成加强组duty；
	2、假设runmode设置不允许加强组，run_modes_ids不等于1，如果航班配比有3p（如特殊机场），则根据3013/2007/2008参数设置生成相应的duty、pairing；
	如果航班配比没有3p，则不生成3p的duty、pairing；
	3、假设runmode设置允许加强组，run_modes_ids等于1，则直接根据3013/2007/2008生成符合参数设置的duty、pairing
	*/
	for (auto& mode : modes)
	{
		if (mode == 1)
			canAugmented = true;
	}

	vector<DBRule> rules = _data->ruleList;
	string header, headValue;
	string strDefinition, strValue;
	string includeCO, includeLastDHD;
	size_t iExclueIndex1, iExclueIndex2;

	string strLocalStart = "00:00", strLocalEnd = "00:00", strMinRestInLocalNight = "00:00";
	string strWoclStart = "00:00", strWoclEnd = "00:00";
	string strEarlyStartStart = "00:00", strEarlyStartEnd = "00:00";
	string strLateFinishStart = "00:00", strLateFinishEnd = "00:00";
	string strNightDutyStart = "00:00", strNightDutyEnd = "00:00";

	for (size_t iRule = 0; iRule < rules.size(); iRule++)
	{
		DBRule singleRule = rules[iRule];
		map<string, string> parameter = singleRule.params;
		map<string, string>::iterator iter;
		long long iPhase = singleRule.phase;

		if (singleRule.function == RULES::MAX_PTN_IN_SCENARIO)
			_rules8073.push_back(singleRule);

		if (singleRule.function == RULES::MAX_PTN_BY_DATE)
			_rules8173.push_back(singleRule);

		if (singleRule.function == RULES::LOCAL_NIGHT_DEFINITION)
		{
			map<string, string>::iterator iter;
			string header, headeValue;
			map<string, string> parameter = singleRule.params;
			for (iter = parameter.begin(); iter != parameter.end(); iter++){
				header = trim(iter->first);
				headeValue = trim(iter->second);
				//transform(header.begin(), header.end(), header.begin(), ::toupper);
				//transform(headeValue.begin(), headeValue.end(), headeValue.begin(), ::toupper);

				//Definition
				//LOCAL NIGHT START,LOCAL NIGHT END,MIN INTERVAL HOURS
				if (header == "LOCAL NIGHT START")
					strLocalStart = headeValue;
				if (header == "LOCAL NIGHT END")
					strLocalEnd = headeValue;
				if (header == "MIN INTERVAL HOURS")
					strMinRestInLocalNight = headeValue;
			}
		}

		if (singleRule.function == WOCL_DEFINITION)
		{
			map<string, string>::iterator iter;
			string header, headeValue;
			map<string, string> parameter = singleRule.params;
			for (iter = parameter.begin(); iter != parameter.end(); iter++) {
				header = trim(iter->first);
				headeValue = trim(iter->second);
				//transform(header.begin(), header.end(), header.begin(), ::toupper);
				//transform(headeValue.begin(), headeValue.end(), headeValue.begin(), ::toupper);

				//Definition
				//LOCAL NIGHT START,LOCAL NIGHT END,MIN INTERVAL HOURS
				if (header == "WOCL START")
					strWoclStart = headeValue;
				if (header == "WOCL END")
					strWoclEnd = headeValue;
			}
		}

		if (singleRule.function == EARLY_START_DEFINITION)
		{
			map<string, string>::iterator iter;
			string header, headeValue;
			map<string, string> parameter = singleRule.params;
			for (iter = parameter.begin(); iter != parameter.end(); iter++) {
				header = trim(iter->first);
				headeValue = trim(iter->second);
				//transform(header.begin(), header.end(), header.begin(), ::toupper);
				//transform(headeValue.begin(), headeValue.end(), headeValue.begin(), ::toupper);

				//Definition
				//LOCAL NIGHT START,LOCAL NIGHT END,MIN INTERVAL HOURS
				if (header == "EARLY START START")
					strEarlyStartStart = headeValue;
				if (header == "EARLY START END")
					strEarlyStartEnd = headeValue;
			}
		}

		if (singleRule.function == LATE_FINISH_DEFINITION)
		{
			map<string, string>::iterator iter;
			string header, headeValue;
			map<string, string> parameter = singleRule.params;
			for (iter = parameter.begin(); iter != parameter.end(); iter++) {
				header = trim(iter->first);
				headeValue = trim(iter->second);
				//transform(header.begin(), header.end(), header.begin(), ::toupper);
				//transform(headeValue.begin(), headeValue.end(), headeValue.begin(), ::toupper);

				//Definition
				//LOCAL NIGHT START,LOCAL NIGHT END,MIN INTERVAL HOURS
				if (header == "LATE FINISH START")
					strLateFinishStart = headeValue;
				if (header == "LATE FINISH END")
					strLateFinishEnd = headeValue;
			}
		}

		if (singleRule.function == NIGHT_DUTY_DEFINITION)
		{
			map<string, string>::iterator iter;
			string header, headeValue;
			map<string, string> parameter = singleRule.params;
			for (iter = parameter.begin(); iter != parameter.end(); iter++) {
				header = trim(iter->first);
				headeValue = trim(iter->second);
				//transform(header.begin(), header.end(), header.begin(), ::toupper);
				//transform(headeValue.begin(), headeValue.end(), headeValue.begin(), ::toupper);

				//Definition
				//LOCAL NIGHT START,LOCAL NIGHT END,MIN INTERVAL HOURS
				if (header == "NIGHT DUTY START")
					strNightDutyStart = headeValue;
				if (header == "NIGHT DUTY END")
					strNightDutyEnd = headeValue;
			}
		}

		if (singleRule.function == RULES::MAX_PROBATION_CROSSRANKS)
		{
			string rank, days; 
			int daysReq=0;
			for (iter = parameter.begin(); iter != parameter.end(); iter++)
			{
				header = trim(iter->first);
				headValue = trim(iter->second);
				if (header == "RANK")
				{
					rank = headValue;
				}
				if (header == "PROBATION DAYS")
				{
					days = headValue;
					daysReq = stoi(days);
				}
			}
			if (rank.length()>0 && daysReq>0)
				this->_probations.insert(make_pair(rank,daysReq));
		}


		if (singleRule.function == RULES::MAX_BLOCK_PERDUTY || singleRule.function == RULES::MAX_BLOCK_PERDUTY_R4)
		{
			//1	COMPOSITION, RPT START, RPT END, MAX BLH
			//DEFINITION,VALUE
			//USEHISTORICALBLH,Y
			for (iter = parameter.begin(); iter != parameter.end(); iter++)
			{
				header = iter->first;
				headValue = iter->second;

				if (header == "DEFINITION") {
					strDefinition = headValue;
				}
				if (header == "VALUE") {
					strValue = headValue;
				}
			}

			if ((strDefinition == "USEHISTORICALBLH") && (strValue == "Y"))
			{
				this->isUseHistoryBlk = true;
			}

		}
		if (singleRule.function == RULES::MAX_FDP_PERDUTY)
		{
			for (iter = parameter.begin(); iter != parameter.end(); iter++)
			{
				header = trim(iter->first);
				headValue = trim(iter->second);

				if (headValue == "INCLUDE CHECK OUT" && header == "DEFINITION")
				{
					includeCO = (++iter)->second;
					iExclueIndex1 = iRule;
					if (includeCO == "N")
						this->SetFDP_CO(0);
					else
						this->SetFDP_CO(1);
				}
				if (headValue == "INCLUDE LAST DHD" && header == "DEFINITION")
				{
					iExclueIndex2 = iRule;
					includeLastDHD = (++iter)->second;
					if (includeLastDHD == "N")
						this->SetFDP_LAST_DHD(0);
					else
						this->SetFDP_LAST_DHD(1);
				}
			}
		}

		if (singleRule.function == RULES::MAX_FDP_AFTER_DELAY_DEFINITION)
		{
			auto maxFDPAfterDelayDefinition = std::make_shared<max_fdp_after_delay_definition>();
			string header, headeValue;
			map<string, string> parameter = singleRule.params;
			for (map<string, string>::iterator iter = parameter.begin(); iter != parameter.end(); iter++) {
				header = trim(iter->first);
				headeValue = trim(iter->second);

				//Definition
				//Amount of Total Delay,Amount of Notification Ranges,Revised/Original FDP Start Time(R/O),FDP Start Time Delta
				if (header == "AMOUNT OF TOTAL DELAY") {
					maxFDPAfterDelayDefinition->totalFlightDelay = headeValue;

					vector<string> splitstrs;
					split(headeValue.c_str(), '-', splitstrs);
					if (splitstrs.size() >= 2) {
						maxFDPAfterDelayDefinition->totalFlightDelayMinutesLower = hhmmToMinutes(splitstrs[0].c_str());
						maxFDPAfterDelayDefinition->totalFlightDelayMinutesUpper = hhmmToMinutes(splitstrs[1].c_str());
					}
				}
				else if (header == "AMOUNT OF NOTIFICATION RANGES") {
					maxFDPAfterDelayDefinition->amountOfNotificationRanges = headeValue;

					vector<string> splitstrs;
					split(headeValue.c_str(), '-', splitstrs);
					if (splitstrs.size() >= 2) {
						maxFDPAfterDelayDefinition->amountOfNotificationMinutesLower = hhmmToMinutes(splitstrs[0].c_str());
						maxFDPAfterDelayDefinition->amountOfNotificationMinutesUpper = hhmmToMinutes(splitstrs[1].c_str());
					}
				}
				else if (header == "REVISED OR ORIGINAL FDP START TIME(R/O)") {
					maxFDPAfterDelayDefinition->revisedOrOriginalFDPStartTime = headeValue;
				}
				else if (header == "FDP START TIME DELTA") {
					maxFDPAfterDelayDefinition->fdpStartTimeDelta = headeValue;
					maxFDPAfterDelayDefinition->fdpStartTimeDeltaMinutes = (headeValue == "*"  || headeValue.empty())  ? 0 : hhmmToMinutes(headeValue.c_str());
				}
				else if (header == "IS SCHEDULE DEPARTURE TIME(Y/N)") {
					maxFDPAfterDelayDefinition->isSTD = (headeValue == "*" || headeValue.empty()) ? nullptr : std::make_shared<bool>(strToUpper(headeValue) == "Y");
				}
			}
			_maxFDPAfterDelayDefinitions.push_back(maxFDPAfterDelayDefinition);
		}
		if (singleRule.function == RULES::SBY_FDP_AND_REST_DEFINITION_FOR_HX && singleRule.tableNum ==1)
		{
			auto sbyFDPAndRestDefinition = std::make_shared<Standby_FDP_And_Rest_Definition>();
			string header, headeValue;
			map<string, string> parameter = singleRule.params;
			for (map<string, string>::iterator iter = parameter.begin(); iter != parameter.end(); iter++) {
				header = trim(iter->first);
				headeValue = trim(iter->second);

				//Definition
				if (header == "STANDBY ASSIGNMENTS") {
					if (!headeValue.empty() && headeValue != "*") {
						split(headeValue, '|', sbyFDPAndRestDefinition->standbyAssignments);
					}
				}
				else if (header == "FLIGHT WITHIN THE PLANNED STANDBY" || header == "DUTY WITHIN THE PLANNED STANDBY") {
					sbyFDPAndRestDefinition->dutyWithinThePlannedStandby = headeValue == "Y";
				}
				else if (header == "CALL OUT TO FLIGHT GAP RANGE") {
					sbyFDPAndRestDefinition->callOutToFlightGapRange = headeValue;
					if (!headeValue.empty() && headeValue != "*" && headeValue.find("-") != string::npos)
					{
						vector<string> splitstrs;
						split(headeValue.c_str(), '-', splitstrs);
						if (splitstrs.size() >= 2) {
							sbyFDPAndRestDefinition->callOutToFlightGapStart = hhmmToMinutes(splitstrs[0].c_str());
							sbyFDPAndRestDefinition->callOutToFlightGapEnd = hhmmToMinutes(splitstrs[1].c_str());
						}
					}
				}
				else if (header == "ACTUAL FDP CALC START") {
					sbyFDPAndRestDefinition->actualFdpCalcStart = strToUpper(headeValue);
				}
				else if (header == "ACTUAL FDP CALC END") {
					sbyFDPAndRestDefinition->actualFdpCalcEnd = strToUpper(headeValue);
				}
				else if (header == "ACTUAL DP CALC START") {
					sbyFDPAndRestDefinition->actualDpCalcStart = strToUpper(headeValue);
				}
				else if (header == "ACTUAL DP CALC END") {
					sbyFDPAndRestDefinition->actualDpCalcEnd = strToUpper(headeValue);
				}
				else if (header == "FDP REPORTING TIME START") {
					sbyFDPAndRestDefinition->fdpReportingTimeStart = strToUpper(headeValue);
				}
				else if (header == "ACTUAL REST CALCULATE") {
					sbyFDPAndRestDefinition->actualRestCalculate = strToUpper(headeValue);
				}
				else if (header == "SBY REST RATIO") {
					sbyFDPAndRestDefinition->standbyRestRatioStr = headeValue;
					if (!headeValue.empty() && headeValue != "*") {
						sbyFDPAndRestDefinition->standbyRestRatioValue = stod(headeValue);
					}
				}
				else if (header == "REST EXCLUDE SBY WINDOW") {
					sbyFDPAndRestDefinition->restExcludeSbyWindow = headeValue;
					if (!headeValue.empty() && headeValue != "*" && headeValue.find("-") != string::npos)
					{
						vector<string> splitstrs;
						split(headeValue.c_str(), '-', splitstrs);
						if (splitstrs.size() >= 2) {
							sbyFDPAndRestDefinition->restExcludeSbyWindowStart = hhmmToMinutes(splitstrs[0].c_str());
							sbyFDPAndRestDefinition->restExcludeSbyWindowEnd = hhmmToMinutes(splitstrs[1].c_str());
						}
					}
				}
			}
			standbyFDPAndRestDefinitions.push_back(sbyFDPAndRestDefinition);
		}

		if (singleRule.function == RULES::SBY_FDP_AND_REST_DEFINITION_FOR_HX && singleRule.tableNum == 2)
		{
			auto sbyDPDefinition = std::make_shared<Standby_DP_Definition>();
			string header, headeValue;
			map<string, string> parameter = singleRule.params;
			for (map<string, string>::iterator iter = parameter.begin(); iter != parameter.end(); iter++) {
				header = trim(iter->first);
				headeValue = trim(iter->second);

				//Definition
				if (header == "STANDBY ASSIGNMENTS") {
					if (!headeValue.empty() && headeValue != "*") {
						split(headeValue, '|', sbyDPDefinition->standbyAssignments);
					}
				}
				else if (header == "DP RATIO") {
					sbyDPDefinition->sbyDPRatioStr = headeValue;
					if (!headeValue.empty() && headeValue != "*") {
						sbyDPDefinition->sbyDPRatioValue = atof(headeValue.c_str());
					}
				}
				else if (header == "SBY WINDOW") {
					sbyDPDefinition->sbyWindow = headeValue;
					if (!headeValue.empty() && headeValue != "*" && headeValue.find("-") != string::npos)
					{
						vector<string> splitstrs;
						split(headeValue.c_str(), '-', splitstrs);
						if (splitstrs.size() >= 2) {
							sbyDPDefinition->sbyWindowStart = hhmmToMinutes(splitstrs[0].c_str());
							sbyDPDefinition->sbyWindowEnd = hhmmToMinutes(splitstrs[1].c_str());
						}
					}
				}
			}
			standbyDPDefinitions.push_back(sbyDPDefinition);
		}
	}

	if (strLocalEnd.length() == 4)
		strLocalEnd = "0" + strLocalEnd;
	if (strLocalStart.length() == 4)
		strLocalStart = "0" + strLocalStart;
	if (strMinRestInLocalNight.length() == 4)
		strMinRestInLocalNight = "0" + strMinRestInLocalNight;
	localnight.LocalEnd = strLocalEnd;
	localnight.LocalStart = strLocalStart;
	localnight.MinRestInterval = strMinRestInLocalNight;
	wocl_definition.woclStart = stoi(strWoclStart.substr(0, strWoclStart.find(":"))) * 60 + stoi(strWoclStart.substr(strWoclStart.find(":") + 1));
	wocl_definition.woclEnd = stoi(strWoclEnd.substr(0, strWoclEnd.find(":"))) * 60 + stoi(strWoclEnd.substr(strWoclEnd.find(":") + 1));;
	earlyStart.earlyStartStart = stoi(strEarlyStartStart.substr(0, strEarlyStartStart.find(":"))) * 60 + stoi(strEarlyStartStart.substr(strEarlyStartStart.find(":") + 1));;
	earlyStart.earlyStartEnd = stoi(strEarlyStartEnd.substr(0, strEarlyStartEnd.find(":"))) * 60 + stoi(strEarlyStartEnd.substr(strEarlyStartEnd.find(":") + 1));;
	lateFinish.lateFinishStart = stoi(strLateFinishStart.substr(0, strLateFinishStart.find(":"))) * 60 + stoi(strLateFinishStart.substr(strLateFinishStart.find(":") + 1));;
	lateFinish.lateFinishEnd = stoi(strLateFinishEnd.substr(0, strLateFinishEnd.find(":"))) * 60 + stoi(strLateFinishEnd.substr(strLateFinishEnd.find(":") + 1));;
	nightDuty.nightDutyStart = stoi(strNightDutyStart.substr(0, strNightDutyStart.find(":"))) * 60 + stoi(strNightDutyStart.substr(strNightDutyStart.find(":") + 1));;
	nightDuty.nightDutyEnd = stoi(strNightDutyEnd.substr(0, strNightDutyEnd.find(":"))) * 60 + stoi(strNightDutyEnd.substr(strNightDutyEnd.find(":") + 1));;

	//Rank map init
	vector<RANK>& ranks=_data->rankList;

	for (vector<RANK>::iterator rank = ranks.begin(); rank != ranks.end(); ++rank)
	{
		if ((*rank).airline == _data->scenario.airline)
		{
			_ranks.insert(pair<string, bool>((*rank).rank, (*rank).division != "P"));
		}
	}

}

bool RuleParams::isCabinRank(string rank)
{
	bool bReturn = true;
	map<string, bool>::iterator it_rank;
	it_rank=_ranks.find(rank);
	if (it_rank != _ranks.end())
		bReturn = it_rank->second;
	return bReturn;
}

void RuleParams::loadAssignments(vector<SharedPtr<DBRule_8014>> assignments, string airlinecode)
{
	//vector<string> daysOffs, restAssignments;
	for (vector<SharedPtr<DBRule_8014>>::iterator assignment = assignments.begin(); assignment != assignments.end(); assignment++)
	{
		//if ((*assignment)->assignmentGroup == rGroup && (*assignment)->airline == airlinecode)
		//{
		//	daysOffs.push_back((*assignment)->assignemnt);
		//}
		if ((*assignment)->assignmentGroup == "REST" )
			this->restAssignments.push_back((*assignment)->assignemnt);

		if ((*assignment)->assignmentGroup == "SBY")
			this->standbyAssignments.push_back((*assignment)->assignemnt);
		
	}

}

int  RuleParams::GetFDP_CO() { return this->_FDP_Include_CO; };

int  RuleParams::GetFDP_LAST_DHD() { return this->_FDP_Include_LASTDHD; };

int RuleParams::GetFDPMode(){
	int iReturn = 0;
	if (this->GetFDP_CO() == 0 && this->GetFDP_LAST_DHD() == 0)
		iReturn = 0;
	if (this->GetFDP_CO() == 0 && this->GetFDP_LAST_DHD() == 1)
		iReturn = 1;
	if (this->GetFDP_CO() == 1 && this->GetFDP_LAST_DHD() == 0)
		iReturn = 2;
	if (this->GetFDP_CO() == 1 && this->GetFDP_LAST_DHD() == 1)
		iReturn = 3;
	return iReturn;
};

map<string, int>* RuleParams::getProbations(){ return &(_probations); };
bool RuleParams::isUseHistoryBlock(){ return isUseHistoryBlk; };
vector<string>* RuleParams::getRestAssignments(){ return &(restAssignments); };
vector<string>* RuleParams::getStandbyAssignments(){ return &(standbyAssignments); };
bool RuleParams::isRestAssignment(const string& assignment, const string& assignmentGroup)
{
	auto iterAssign = _assignmentNameMap.find(assignment);
	if (iterAssign != _assignmentNameMap.end() && iterAssign->second != nullptr && (iterAssign->second->TYPE == "L" || iterAssign->second->TYPE == "O")) {
		return true;
	}
	if (!assignment.empty() && find(restAssignments.begin(), restAssignments.end(), assignment) != restAssignments.end())
		return true;

	if (!assignmentGroup.empty() && find(restAssignments.begin(), restAssignments.end(), assignmentGroup) != restAssignments.end())
		return true;

	return false;
}
Local_Night_Definition& RuleParams::getLocalNightDefinition(){ return localnight; };
WOCL_Definition& RuleParams::getWOCLDefinition() { return wocl_definition; }
Early_Start_Definition& RuleParams::getEarlyStartDefinition() { return earlyStart; }
Late_Finish_Definition& RuleParams::getLateFinishDefinition() { return lateFinish; }
Night_Duty_Definition& RuleParams::getNightDutyDefinition() { return nightDuty; }
const vector<std::shared_ptr<Standby_FDP_And_Rest_Definition>>& RuleParams::getStandbyFDPAndRestDefinitions() const { return standbyFDPAndRestDefinitions; };
const vector<std::shared_ptr<Standby_DP_Definition>>& RuleParams::getStandbyDPDefinitions() const { return standbyDPDefinitions; };
const DP_Definition& RuleParams::getDPDefinition() const { return dpDefinition; };
RuleParams::RuleParams(){};
RuleParams::~RuleParams(){
	//20190418 ain, mantis#5183, 清理mem leak
	split_duty.clear();
};
void RuleParams::SetFDP_CO(int iMode) { this->_FDP_Include_CO = iMode; };
void RuleParams::SetFDP_LAST_DHD(int iMode) { this->_FDP_Include_LASTDHD = iMode; };

vector<std::shared_ptr<max_fdp_after_delay_definition>>& RuleParams::getMaxFDPAfterDelayDefinitions() {
	return this->_maxFDPAfterDelayDefinitions;
}

bool Standby_FDP_And_Rest_Definition::match(const ROSTER* prevRoster, const ROSTER* currRoster) const {
	if (prevRoster == nullptr || currRoster == nullptr || currRoster->pairing == nullptr) {
		return false;
	}
	if (std::find(this->standbyAssignments.begin(), this->standbyAssignments.end(), prevRoster->qualifier) == this->standbyAssignments.end()) {
		return false;
	}

	bool tmpDutyWithinThePlannedStandby = false;
	auto firstSegment = currRoster->pairing->getFirstSegment();
	if (prevRoster->actStrUtc < firstSegment->getStartTimeUtcAct() && prevRoster->actRestStrUtc >= firstSegment->getStartTimeUtcAct())
	{
		tmpDutyWithinThePlannedStandby = true;
	}
	if (tmpDutyWithinThePlannedStandby != this->dutyWithinThePlannedStandby) {
		return false;
	}

	if (!callOutToFlightGapRange.empty() && callOutToFlightGapRange != "*") {
		if (prevRoster->calloutUtc <= 0) {
			return false;
		}
		//int callOutToFlightGap = static_cast<int>(firstSegment->getStartTimeUtcAct() - currRoster->notificationTime) / 60;//notificationTime 通知callout时间点
		int callOutToFlightGap = static_cast<int>(firstSegment->getStartTimeUtcAct() - prevRoster->calloutUtc) / 60;//calloutUtc抓飞时间点
		if (callOutToFlightGap < this->callOutToFlightGapStart || callOutToFlightGap > this->callOutToFlightGapEnd) {
			return false;
		}
	}

	return true;
}

bool Standby_DP_Definition::match(const ROSTER* roster) const {
	if (roster == nullptr) {
		return false;
	}
	if (this->sbyDPRatioStr.empty() || this->sbyDPRatioStr == "*") {
		return false;
	}
	if (this->standbyAssignments.empty()) {
		return true;
	}
	if (this->standbyAssignments[0] == "*" || this->standbyAssignments[0] == "") {
		return true;
	}
	return std::find(this->standbyAssignments.begin(), this->standbyAssignments.end(), roster->qualifier) != this->standbyAssignments.end();
}

bool DP_Definition::matchSegment(const Segment* segment) const {
	if (!dpAssignments.empty() && find(dpAssignments.begin(), dpAssignments.end(), segment->getAssignment()) == dpAssignments.end()) {
		return false;
	}

	if (flightHours > 0 && segment->getBlkMinutes() < flightHours) {
		return false;
	}

	if (!domIntTypes.empty() && find(domIntTypes.begin(), domIntTypes.end(), segment->getDomIntType()) == domIntTypes.end()) {
		return false;
	}

	if (!serviceTypes.empty() && find(serviceTypes.begin(), serviceTypes.end(), segment->getFltType()) == serviceTypes.end()) {
		return false;
	}

	return true;
}


bool DP_Definition::matchCalloutAssignment(const string& assignment) const {
	return find(calloutAssignments.begin(), calloutAssignments.end(), assignment) != calloutAssignments.end();
}
