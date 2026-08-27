#include "SegmentUtils.h"

#include "TimezoneUtils.h"
#include "TimeUtils.h"
#include "StringUtil.h"


inline static bool _MatchSingleBlhRangeMinutes(const int blhMinutes, const std::pair<int, int>& rangeMinutes) {
	return blhMinutes >= rangeMinutes.first && blhMinutes < rangeMinutes.second;
}

inline static bool _MatchDistinctSegmentsForRanges(const std::vector<int>& segmentBlhMinutes, const std::vector<std::pair<int, int>>& rangeMinutes,
	std::vector<bool>& usedSegments, const size_t rangeIndex) {
	if (rangeIndex >= rangeMinutes.size()) {
		return true;
	}

	for (size_t segmentIndex = 0; segmentIndex < segmentBlhMinutes.size(); ++segmentIndex) {
		if (usedSegments[segmentIndex]) {
			continue;
		}
		if (!_MatchSingleBlhRangeMinutes(segmentBlhMinutes[segmentIndex], rangeMinutes[rangeIndex])) {
			continue;
		}

		usedSegments[segmentIndex] = true;
		if (_MatchDistinctSegmentsForRanges(segmentBlhMinutes, rangeMinutes, usedSegments, rangeIndex + 1)) {
			return true;
		}
		usedSegments[segmentIndex] = false;
	}

	return false;
}

int SegmentUtils::GetTransitDurationInSecs(const Segment* currSegment, const Segment* nextSegment) {
	time_t transitStartTimeUtc = currSegment->getEndTimeUtcAct();
	time_t transitEndTimeUtc = nextSegment->getStartTimeUtcAct();
	//过站时长秒数
	int transitDuration = static_cast<int>(transitEndTimeUtc - transitStartTimeUtc);
	return transitDuration;
}

int SegmentUtils::GetActualRestMinutes(const Segment* currSegment, const Segment* nextSegment, const long_transit* longTransit) {
	time_t restStartTimeUtc = 0;
	time_t restEndTimeUtc = 0;
	GetActualRestStartAndEndTimeUtc(restStartTimeUtc, restEndTimeUtc, currSegment, nextSegment, longTransit);
	return static_cast<int>(restEndTimeUtc - restStartTimeUtc) / 60;
}

bool SegmentUtils::existNode(const Duty* duty, const Segment* currSegment, const Segment* nextSegment) {
	vector<shared_ptr<PairingDutyNode>> pdns = duty->pairingDutyNodes;
	auto segDropoff = Utility::GetInstancePtr()->getPairingDutyNode(pdns, "SEGMENT", "DROPOFF", nextSegment->getSegmentId());
	return segDropoff != nullptr;
}

int SegmentUtils::GetActualRestMinutes(const Duty* duty, const Segment* currSegment, const Segment* nextSegment) {
	long actRest = static_cast<int>(nextSegment->getStartTimeUtcAct() - currSegment->getEndTimeUtcAct());
	vector<shared_ptr<PairingDutyNode>> pdns = duty->pairingDutyNodes;
	auto segDropoff = Utility::GetInstancePtr()->getPairingDutyNode(pdns, "SEGMENT", "DROPOFF", nextSegment->getSegmentId());
	auto segPickup = Utility::GetInstancePtr()->getPairingDutyNode(pdns, "SEGMENT", "PICKUP", nextSegment->getSegmentId());
	if (segDropoff != nullptr && segPickup != nullptr) {
		actRest = static_cast<int>(segPickup->getStartTimeUtcAct() - segDropoff->getEndTimeUtcAct());
	}
	return actRest / 60;
}

void SegmentUtils::GetActualRestStartAndEndTimeUtc(time_t& restStartTimeUtc, time_t& restEndTimeUtc, const Segment* currSegment, const Segment* nextSegment) {
	Segment* tmpCurrSegment = (Segment*)currSegment;
	Segment* tmpNextSegment = (Segment*)nextSegment;
	long_transit* transit = RuleParams::GetInstancePtr()->getTransit(tmpCurrSegment, tmpNextSegment);
	GetActualRestStartAndEndTimeUtc(restStartTimeUtc, restEndTimeUtc, currSegment, nextSegment, transit);
}

void SegmentUtils::GetActualRestStartAndEndTimeUtc(time_t& restStartTimeUtc, time_t& restEndTimeUtc, const Segment* currSegment, const Segment* nextSegment, const long_transit* longTransit) {
	restStartTimeUtc = currSegment->getEndTimeUtcAct();
	restEndTimeUtc = nextSegment->getStartTimeUtcAct();
	if (longTransit) {
		int pseudoCI = longTransit->pseudoCI, pseudoCO = longTransit->pseudoCO;
		int pseudoPickup = longTransit->pseudoPickup, pseudoDropoff = longTransit->pseudoDropoff;
		restStartTimeUtc = restStartTimeUtc + static_cast<time_t>(pseudoCO + pseudoDropoff) * 60;
		restEndTimeUtc = restEndTimeUtc - static_cast<time_t>(pseudoCI + pseudoPickup) * 60;
	}
}

//获得下一个Segment的FDP开始时间（UTC时间）
time_t SegmentUtils::GetNextSegmentFDPStartTimeUtc(const Segment* currSegment, const Segment* nextSegment, const long_transit* longTransit, const bool isIncludeLongTransitPickup) {
	time_t restStartTimeUtc = 0;
	time_t restEndTimeUtc = 0;
	SegmentUtils::GetActualRestStartAndEndTimeUtc(restStartTimeUtc, restEndTimeUtc, currSegment, nextSegment, longTransit);

	time_t nextSegmentFDPStartTimeUtc = restEndTimeUtc;
	if (longTransit != nullptr) {
		if (!RuleParams::GetInstancePtr()->bIncludeLongTransitPickup || !isIncludeLongTransitPickup) {
			nextSegmentFDPStartTimeUtc += (longTransit->pseudoPickup * 60);
		}
		if (!RuleParams::GetInstancePtr()->bIncludeLongTransitCI) {
			nextSegmentFDPStartTimeUtc += (longTransit->pseudoCI * 60);
		}

	}

	return nextSegmentFDPStartTimeUtc;
}

int SegmentUtils::GetTimeZoneOffset(const Segment& segment, const SharedPtr<CrewDataContext>& dbData) {
	return GetTimeZoneOffsetByDep(segment, dbData);
}

int SegmentUtils::GetTimeZoneOffsetByDep(const Segment& segment, const SharedPtr<CrewDataContext>& dbData) {
	string depZoneId = dbData->getAirportZoneId(segment.getDepStation());
	int offset = TimezoneUtils::GetTimezoneOffset(segment.getStartTimeUtcAct(), depZoneId);
	return offset;
}

int SegmentUtils::GetTimeZoneOffsetByArr(const Segment& segment, const SharedPtr<CrewDataContext>& dbData) {
	string arrZoneId = dbData->getAirportZoneId(segment.getArrStation());
	int offset = TimezoneUtils::GetTimezoneOffset(segment.getEndTimeUtcAct(), arrZoneId);
	return offset;
}

int SegmentUtils::GetFastTimeZoneOffsetByDep(const Segment& segment, const SharedPtr<CrewDataContext>& dbData) {
	int offset = 0;
	if (segment.getStartTimeUtcAct() > 0 && segment.getStartTimeLocAct() > 0) {
		offset = static_cast<int>(segment.getStartTimeUtcAct() - segment.getStartTimeLocAct());
	}
	else {
		offset = GetTimeZoneOffsetByDep(segment, dbData);
	}
	return offset;
}

int SegmentUtils::GetBlkMinutes(const Segment& segment) {
	int blkMinutes = segment.getBlkMinutes();
	return blkMinutes < 0 ? 0 : blkMinutes;
}

int SegmentUtils::GetSchBlkMinutes(const Segment& segment) {
	int blkMinutes = segment.getSchBlkMinutes();
	return blkMinutes < 0 ? 0 : blkMinutes;
}

int SegmentUtils::GetBlkMinutesWithTruncation(const Segment& segment, const time_t lowerLimitTimeUtc, const time_t upperLimitTimeUtc, const SharedPtr<CrewDataContext>& dbData) {
	int blkTime = 0;
	auto iter = dbData->assignmentNameMap.find(segment.getAssignment());

	if (iter == dbData->assignmentNameMap.end()) {
		blkTime = (int)round((std::min(segment.getEndTimeUtcAct(), upperLimitTimeUtc) - std::max(segment.getStartTimeUtcAct(), lowerLimitTimeUtc)));
	}
	else {
		blkTime = (int)round((std::min(segment.getEndTimeUtcAct(), upperLimitTimeUtc) - std::max(segment.getStartTimeUtcAct(), lowerLimitTimeUtc)) * (iter->second->BT_PCT));
	}
	return blkTime < 0 ? 0 : blkTime / 60;
}

int SegmentUtils::GetSchBlkMinutesWithTruncation(const Segment& segment, const time_t lowerLimitTimeUtc, const time_t upperLimitTimeUtc, const SharedPtr<CrewDataContext>& dbData) {
	int blkTime = 0;
	auto iter = dbData->assignmentNameMap.find(segment.getAssignment());

	if (iter == dbData->assignmentNameMap.end()) {
		blkTime = (int)round((std::min(segment.getEndTimeUtcSch(), upperLimitTimeUtc) - std::max(segment.getStartTimeUtcSch(), lowerLimitTimeUtc)));
	}
	else {
		blkTime = (int)round((std::min(segment.getEndTimeUtcSch(), upperLimitTimeUtc) - std::max(segment.getStartTimeUtcSch(), lowerLimitTimeUtc)) * (iter->second->BT_PCT));
	}
	return blkTime < 0 ? 0 : blkTime / 60;
}

bool SegmentUtils::IsActualTakeOff(const Segment* segment, const SharedPtr<CrewDataContext>& dbData) {
	auto iterFlt = dbData->flightIdMap.find(segment->getDBId());
	if (iterFlt == dbData->flightIdMap.end()) {
		return false;
	}
	auto& flight = iterFlt->second;
	if (flight->getActTaxiOutUtc() > 0) {
		return true;
	}

	if (flight->getStartTimeUtcAct() > 0 && flight->getEstDepDtUtc() > 0 && flight->getStartTimeUtcAct() != flight->getEstDepDtUtc()) {
		return true;
	}

	return false;
}

//是否夜航起飞
bool SegmentUtils::IsNightTaskOff(const Segment* segment, const SharedPtr<CrewDataContext>& dbData) {
	//[18:00, 06 : 00] 认为是夜航
	return TimeUtils::IsTimesInRange(segment->getStartTimeLocAct(), 1080, 480);
}

//是否夜航降落
bool SegmentUtils::IsNightLanding(const Segment* segment, const SharedPtr<CrewDataContext>& dbData) {
	//[18:00, 06 : 00] 认为是夜航
	return TimeUtils::IsTimesInRange(segment->getEndTimeLocAct(), 1080, 480);
}

bool SegmentUtils::GetRestFacility(int& restFacility, const Segment* segment, const SharedPtr<CrewDataContext>& dbData) {
	bool matched = false;

	bool separateRestFacility = false;//是否按CC或者FD拆分休息设施，true：拆分，false：不拆分
	auto iterParam = dbData->systemParamMap.find("SEPARATE_CC_REST_FACILITY");
	if (iterParam != dbData->systemParamMap.end()) {
		separateRestFacility = (strToUpper(iterParam->second) == "Y");
	}

	restFacility = 0;

	auto iterSubFleet = dbData->subFleetMap.find(segment->getSubFleet());
	if (iterSubFleet != dbData->subFleetMap.end()) {
		SUB_FLEET& subFleet = iterSubFleet->second;
		if (separateRestFacility && dbData->scenario.division == "C") {
			if (subFleet.ccRestFacility >= 0) {
				restFacility = subFleet.ccRestFacility;
				return true;
			}
		}
		else {
			if (subFleet.restFacility >= 0) {
				restFacility = subFleet.restFacility;
				return true;
			}
		}
	}

	auto iterAircraft = dbData->fltIdToAircraftMap.find(segment->getTailNum());
	if (iterAircraft != dbData->fltIdToAircraftMap.end()) {
		auto& aircraft = iterAircraft->second;
		if (separateRestFacility && dbData->scenario.division == "C") {
			if (aircraft->isExistRest && aircraft->ccRestFacility >= 0) {
				restFacility = aircraft->ccRestFacility;
				return true;
			}
		}
		else {
			if (aircraft->isExistRest && aircraft->restFacility >= 0) {
				restFacility = aircraft->restFacility;
				return true;
			}
		}
	}

	auto iterFleet = dbData->fleetMap.find(segment->getFleetCD());
	if (iterFleet != dbData->fleetMap.end()) {
		auto& fleet = iterFleet->second;
		if (separateRestFacility && dbData->scenario.division == "C") {
			if (fleet.ccRestfacility >= 0) {
				restFacility = fleet.ccRestfacility;
				return true;
			}
		}
		else {
			if (fleet.restfacility >= 0) {
				restFacility = fleet.restfacility;
				return true;
			}
		}
	}

	return matched;
}

bool SegmentUtils::IsDHD(const Segment* segment) {
	return segment->getAssignment() == "DHD";
}

bool SegmentUtils::IsSIM(const Segment* segment) {
	return segment->getAssignment() == "SIM";
}

//获得Segment的Brief
void SegmentUtils::GetBriefAndDebriefOfSIM(shared_ptr<PairingDutyNode>& simBrief, shared_ptr<PairingDutyNode>& simDebrief, const Duty* duty, const long long fltId) {
	//这里要求duty->pairingDutyNodes已经按startUtc升序排序
	simBrief = nullptr, simDebrief = nullptr;
	shared_ptr<PairingDutyNode> dutyBrief = nullptr, dutyDebrief = nullptr;
	for (auto& pdn : duty->pairingDutyNodes) {
		if (pdn->getType() == "DUTY" && pdn->getNode() == "BRIEF") {
			dutyBrief = pdn;
			continue;
		}

		if (pdn->getType() == "DUTY" && pdn->getNode() == "DEBRIEF") {
			dutyDebrief = pdn;
			continue;
		}

		if (pdn->getType() == "SEGMENT" && pdn->getNode() == "BRIEF") {
			if (pdn->getToSegmentId() == fltId) {
				simBrief = pdn;
				continue;
			}
		}
	}

	for (auto& pdn : duty->pairingDutyNodes) {
		if (simBrief != nullptr) {
			if (pdn->getStartUtc() > simBrief->getStartUtc() && pdn->getFromSegmentId() == fltId && pdn->getType() == "SEGMENT" && pdn->getNode() == "DEBRIEF") {
				simDebrief = pdn;
				break;
			}
		}
		else {
			if (pdn->getFromSegmentId() == fltId && pdn->getType() == "SEGMENT" && pdn->getNode() == "DEBRIEF") {
				simDebrief = pdn;
				break;
			}
		}
	}

	if (simBrief == nullptr) {
		//获取不到Segment Brief，则去Duty Brief
		simBrief = dutyBrief;
	}
	if (simDebrief == nullptr) {
		//获取不到Segment Debrief，则去Duty Debrief
		simDebrief = dutyDebrief;
	}
}


int SegmentUtils::GetSegmentNumberInRangeByStartOrEnd(const vector<Segment*>& segments, const time_t checkStart, const time_t checkEnd, const string checkType) {
	int result = 0;
	for (const auto& segment : segments) {
		const auto& targetTime = checkType == "E" ? segment->getEndTimeLocAct() : segment->getStartTimeLocAct();
		if (targetTime >= checkStart && targetTime <= checkEnd)
			result++;

		//超出范围直接跳出
		if (targetTime > checkEnd)
			break;
	}
	return result;
}

string SegmentUtils::GetCompositionBySegmentFor3(const Segment* s, const SharedPtr<CrewDataContext>& dbData, string division) {
	if (!s->getIsOperating() || s->getAssignment() == "DHD" || s->getAssignment() == "BUS") {
		return "";
	}
	string compName;
	long long compid = -9999;
	int hierarchy = 999999;
	long long fltId = s->getDBId();
	map<string, int> rankMap;
	
	//方法2：通过Flight寻找RankMap
	auto iterFlight = dbData->flightIdMap.find(fltId);
	if (iterFlight != dbData->flightIdMap.end()) {
		if (iterFlight->second == nullptr) {
			Logger::getRuleLogger()->error("[DataCheck] ERROR: invalid data, flight do not exist. FlightId:{}, PairingId:{}, DutyId:{}, method=getCompositionByDutySegmentFor3", fltId, s->getPairingId(), s->getDutyId());
		}
		else {
			auto iter = iterFlight->second->getPlanComposition().begin();
			while (iter != iterFlight->second->getPlanComposition().end()) {
				if (dbData->scenario.airline == "CA" && (iter->first == "RO" || iter->first == "OVER")) {
					iter++;
					continue;
				}
				if ((dbData->rankMap[iter->first].division == division || division == "") && dbData->rankMap[iter->first].isMustCrewRank) {
					rankMap[iter->first] += iter->second;
				}
				iter++;
			}
		}

	}

	if (rankMap.size() == 0 && division == "") {
		return "";
	}
	if (rankMap.size() == 0) {
		return "";
	}
	unordered_map<long long, unordered_map<int, composition_rank>>::iterator compIter;
	unordered_map<int, composition_rank>::iterator optionIter;
	map<string, int>::iterator rankIter;
	compIter = dbData->compositionRankOptionMap.begin();
	while (compIter != dbData->compositionRankOptionMap.end()) {
		bool isOk = false;
		optionIter = compIter->second.begin();
		while (optionIter != compIter->second.end()) {

			int iCount = 0;
			int k = -1;
			if (optionIter->second.rankCount == rankMap.size()) {
				for (k = 0; k < optionIter->second.rankCount; k++) {
					string rank = optionIter->second.rankValue[k].rank;
					if (rank == "") {
						continue;
					}
					if (rankMap.find(rank) != rankMap.end() && rankMap[rank] == optionIter->second.rankValue[k].plan_value) {
						iCount++;
					}
					else {
						continue;
					}
				}
			}
			if (iCount == rankMap.size() && k >= optionIter->second.rankCount) {
				isOk = true;
				break;
			}
			optionIter++;
		}

		if (isOk && hierarchy > compIter->second.begin()->second.hierarchy) {
			compid = compIter->first;
			hierarchy = compIter->second.begin()->second.hierarchy;
		}
		compIter++;
	}
	for (auto& composition : dbData->compositionList) {
		if (composition.getCompositionId() == compid) {
			compName = composition.getName();
			break;
		}
	}

	return compName;
}

static inline string GetCompositionName(const long long compId, const SharedPtr<CrewDataContext>& dbData) {
	for (auto& composition : dbData->compositionList) {
		if (composition.getCompositionId() == compId) {
			return composition.getName();
		}
	}
	return "";
}


vector<std::tuple<long long, string, int>> SegmentUtils::GetCompositionOptions(const Segment* segment, const SharedPtr<CrewDataContext>& dbData, const string division) {
	vector<std::tuple<long long, int, int>> segCompOptions; //tuple<composition.Id,composition.hierarchy,compositionRank.option>

	long long fltId = segment->getDBId();

	auto iterFlight = dbData->flightIdMap.find(fltId);
	if (iterFlight == dbData->flightIdMap.end()) {
		//存在异常
		return vector<std::tuple<long long, string, int>>();
	}
	auto& flight = iterFlight->second;
	map<string, int> allRankMap;//map<rank, rank crew number>
	for (auto& flightComplement : flight->getPlanComposition()) {
		auto& rank = flightComplement.first;
		auto rankCrewNum = flightComplement.second;

		//仅汇总必要岗位(isMustCrewRank=true)的人数
		auto iterRank = dbData->rankMap.find(rank);
		if (iterRank == dbData->rankMap.end()) {
			//存在异常
			continue;
		}
		if ((division.empty() || iterRank->second.division == division) && iterRank->second.isMustCrewRank) {
			allRankMap[rank] += rankCrewNum;
		}

	}

	if (allRankMap.empty()) {
		return vector<std::tuple<long long, string, int>>();
	}

	//通过allRankMap推出配比和Option
	for (auto& pair : dbData->compositionRankOptionMap) {
		auto compId = pair.first;//配比ID
		auto& optionRankMap = pair.second; //map<option, composition_rank> 配比的Option以及对应的rank和人数（composition_rank）
		for (auto& pair2 : optionRankMap) {
			auto option = pair2.first;
			auto compositionRank = pair2.second;

			if (compositionRank.rankCount == allRankMap.size()) {//首先满足 配比(compId)中该Option内rank数量一致性

				int matchedRankCount = 0;
				for (int i = 0; i < compositionRank.rankCount; i++) {
					auto& rankValue = compositionRank.rankValue[i];

					auto iterAllRank = allRankMap.find(rankValue.rank);
					if (iterAllRank != allRankMap.end() && iterAllRank->second == rankValue.plan_value) {
						matchedRankCount++;//rank和数量都一致，则匹配到
					}
				}

				if (matchedRankCount == allRankMap.size()) {
					segCompOptions.push_back(std::make_tuple(compId, compositionRank.hierarchy, option));
				}
			}

		}
	}

	long long compId = -1;
	int hierarchy = INT_MAX;
	for (auto& segCompOption : segCompOptions) {
		auto& [currCompId, currHierarchy, currOption] = segCompOption;
		if (hierarchy > currHierarchy) {
			compId = currCompId;
			hierarchy = currHierarchy;
		}
	}

	vector<std::tuple<long long, string, int>> compositionOptions;
	for (auto& segCompOption : segCompOptions) {
		auto& [currCompId, currHierarchy, currOption] = segCompOption;
		if (currCompId == compId) {
			string currCompName = GetCompositionName(currCompId, dbData);
			//注意：这里Option可能只能满足Duty的部分Segment并不一定所有都满足
			compositionOptions.emplace_back(std::make_tuple(currCompId, currCompName, currOption));
		}
	}
	return compositionOptions;
}

//判断是否换飞机
bool SegmentUtils::IsAircraftChange(const Segment* currSegment, const Segment* nextSegment) {
	bool acChg = true;
	if (currSegment->getTailNum().empty() || nextSegment->getTailNum().empty()) {
		acChg = currSegment->getNextLegNo() != nextSegment->getFlightNumber();
	}
	else {
		acChg = currSegment->getTailNum() != nextSegment->getTailNum();
	}

	return acChg;
}


bool SegmentUtils::MatchRoute(const Segment* segment, const vector<string>& routeCodes, const SharedPtr<CrewDataContext>& dbData) {
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

bool SegmentUtils::MatchDistinctSegmentsForRanges(const std::vector<int>& segmentBlhsMinutes, const std::vector<std::pair<int, int>>& segmentBlhRangesMinutes) {
	if (segmentBlhRangesMinutes.size() == 1) {
		for (const auto& blhMinutes : segmentBlhsMinutes) {
			if (_MatchSingleBlhRangeMinutes(blhMinutes, segmentBlhRangesMinutes.front())) {
				return true;
			}
		}
		return false;
	}

	if (segmentBlhsMinutes.size() < segmentBlhRangesMinutes.size()) {
		return false;
	}

	//对 segmentBlhsMinutes 和 segmentBlhRangesMinutes 升序排序
	std::vector<int> sortedSegmentBlhsMinutes = segmentBlhsMinutes;
	std::vector<std::pair<int, int>> sortedSegmentBlhRangesMinutes = segmentBlhRangesMinutes;
	std::sort(sortedSegmentBlhsMinutes.begin(), sortedSegmentBlhsMinutes.end());
	std::sort(sortedSegmentBlhRangesMinutes.begin(), sortedSegmentBlhRangesMinutes.end(), [](const std::pair<int, int>& a, const std::pair<int, int>& b) {
		return a.first < b.first;
		});

	vector<bool> usedSegments(sortedSegmentBlhsMinutes.size(), false);
	return _MatchDistinctSegmentsForRanges(sortedSegmentBlhsMinutes, sortedSegmentBlhRangesMinutes, usedSegments, 0);
}