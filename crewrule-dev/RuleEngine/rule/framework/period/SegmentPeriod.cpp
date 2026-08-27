#include "SegmentPeriod.h"

#include <algorithm>
#include "Duty.h"
#include "UtilFunc.h"
#include "RuleParams.h"
#include "../utils/AssignmentUtils.h"
#include "../utils/StringUtils.h"
#include "../constant/Constants.h"


std::vector<std::unique_ptr<Period>> SegmentPeriod::GetSegmentPeriods(const std::vector<const ROSTER*>& rosters, const std::shared_ptr<CrewDataContext>& dbData) {
	std::vector<std::unique_ptr<Period>> segmentPeriods;
	for (std::vector<const ROSTER*>::const_iterator rosterIter = rosters.begin(); rosterIter != rosters.end(); ++rosterIter)
	{

		Pairing* pairing = (*rosterIter)->pairing;

		if (pairing == nullptr)
		{
			continue;
		}

		std::vector<std::unique_ptr<Period>> tmpSegmentPeriods = GetSegmentPeriods(pairing, dbData);
		for (auto& tmpSegmentPeriod : tmpSegmentPeriods) {
			segmentPeriods.push_back(std::move(tmpSegmentPeriod));
		}
		//for (std::vector<Duty*>::const_iterator dutyIter = dutys.begin(); dutyIter != dutys.end(); ++dutyIter) {
		//	Duty* duty = *dutyIter;
		//	for (Segment* segment : duty->getSegments()) {
		//		std::unique_ptr<SegmentPeriod> segmentPeriod = std::make_unique<SegmentPeriod>();
		//		segmentPeriod->SetPairing(pairing);
		//		segmentPeriod->SetDuty(duty);
		//		segmentPeriod->SetSegment(segment);

		//		segmentPeriod->SetStartTimeUTC(segment->getStartTimeUtcAct());
		//		segmentPeriod->SetEndTimeUTC(segment->getEndTimeUtcAct());
		//		segmentPeriod->SetStartTimeLoc(segment->getStartTimeLocAct());
		//		segmentPeriod->SetEndTimeLoc(segment->getEndTimeLocAct());

		//		segmentPeriods.push_back(std::move(segmentPeriod));
		//	}
		//	
		//}
	}

	//按开始时间排序
	std::stable_sort(segmentPeriods.begin(), segmentPeriods.end(),
		[](const std::unique_ptr<Period>& src, const std::unique_ptr<Period>& dest)->int {
			return src->GetStartTimeUTC() < dest->GetStartTimeUTC();
		}
	);
	return std::move(segmentPeriods);
}

std::vector<std::unique_ptr<Period>> SegmentPeriod::GetSegmentPeriods(const Pairing* pairing, const std::shared_ptr<CrewDataContext>& dbData) {
	return std::move(GetSegmentPeriods(pairing, pairing->getDutyVec(), dbData));
}

std::vector<std::unique_ptr<Period>> SegmentPeriod::GetSegmentPeriods(const Pairing *pairing, const vector<Duty*>& duties, const std::shared_ptr<CrewDataContext>& dbData) {
	std::vector<std::unique_ptr<Period>> segmentPeriods;

	for (std::vector<Duty*>::const_iterator dutyIter = duties.begin(); dutyIter != duties.end(); ++dutyIter) {
		Duty* duty = *dutyIter;
		for (Segment* segment : duty->getSegments()) {
			std::unique_ptr<SegmentPeriod> segmentPeriod = std::make_unique<SegmentPeriod>();
			segmentPeriod->SetPairing(const_cast<Pairing*>(pairing));
			segmentPeriod->SetDuty(duty);
			segmentPeriod->SetSegment(segment);

			segmentPeriod->SetStartTimeUTC(segment->getStartTimeUtcAct());
			segmentPeriod->SetEndTimeUTC(segment->getEndTimeUtcAct());
			segmentPeriod->SetStartTimeLoc(segment->getStartTimeLocAct());
			segmentPeriod->SetEndTimeLoc(segment->getEndTimeLocAct());

			segmentPeriods.push_back(std::move(segmentPeriod));
		}

	}

	//按开始时间排序
	std::stable_sort(segmentPeriods.begin(), segmentPeriods.end(),
		[](const std::unique_ptr<Period>& src, const std::unique_ptr<Period>& dest)->int {
			return src->GetStartTimeUTC() < dest->GetStartTimeUTC();
		}
	);
	return std::move(segmentPeriods);
}