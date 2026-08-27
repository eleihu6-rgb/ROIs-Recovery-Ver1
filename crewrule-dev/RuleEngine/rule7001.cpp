#include "RuleEngine.h"
#include "Utility.h"

#include <time.h>
#include <algorithm>
#include <iostream>

#include "CrewDB.h"
#include "UtilFunc.h"
// #include "orlog.h"
#include <OrLog.h>
#include "RuleParams.h"
#include "UtilDbg.h"
#include "StringUtil.h"

/*
   Pier Solution Limited. 2022/6/22
   EASA ие╣Т 7001
   CS FTL.1.220 Split Duty Definition
  
  The increase of limits on flight duty, under the provisions of ORO.FTL.220, complies with the following:

(a) The break on the ground within the FDP has a minimum duration of 3 consecutive hours.

(b) The break excludes the time allowed for post and pre-flight duties and travelling. The minimum
total time for post and pre-flight duties and travelling is 30 minutes. The operator specifies the
actual times in its operations manual.

(c) The maximum FDP specified in ORO.FTL.205(b) may be increased by up to 50 % of the break.

(d) Suitable accommodation is provided either for a break of 6 hours or more or for a break that
encroaches the window of circadian low (WOCL).

(e) In all other cases:
	(1) accommodation is provided; and
	(2) any time of the actual break exceeding 6 hours or any time of the break that encroaches
the WOCL does not count for the extension of the FDP.

(f) Split duty cannot be combined with in-flight rest.
*/

void LegalityChecker::setSplitDuty(vector<Duty*> duties)
{
	for (auto& duty : duties)
	{
		vector<Segment*> segments = duty->getSegments();
		if (segments.size() <= 1)
			continue;
		for (std::size_t i = 1; i < segments.size(); i++)
		{
			long_transit* longTransit = RuleParams::GetInstancePtr()->getLongTransit(segments[i - 1], segments[i]);
			int transit = static_cast<int>(segments[i]->getStartTimeUtcAct() - segments[i - 1]->getEndTimeUtcAct()) / 60;
			if (longTransit != nullptr) {
				
				int pseudoPickup = longTransit->pseudoPickup, pseudoDropoff = longTransit->pseudoDropoff;
				int actRest = transit - longTransit->pseudoCI - longTransit->pseudoCO - pseudoPickup - pseudoDropoff;

				duty->setSplitDuty(longTransit->isSplitDuty);
				segments[i - 1]->setSplitDuty(longTransit->isSplitDuty);
				duty->splitDutyDurationInMins = max(duty->splitDutyDurationInMins, actRest);
				segments[i - 1]->setTransitDurationMins(transit);
				segments[i - 1]->setTransitRestMins(actRest);
			}
			else {
				if (!duty->isSplitDuty()) {
					duty->setSplitDuty(false);
				}
				segments[i - 1]->setSplitDuty(false);
				segments[i - 1]->setTransitDurationMins(transit);
			}
		}
	}

}

//void LegalityChecker::setSplitDuty(vector<Duty *> duties)
//{
//	string SplitDuty = this->_dbData->systemParamMap["SPLIT_DUTY"];
//	std::size_t iPos = SplitDuty.find(":");
//	int64_t splitDutyTime = 10 * 60;
//	if (iPos != string::npos)
//		splitDutyTime = stoi(SplitDuty.substr(0, iPos)) * 60 + stoi(SplitDuty.substr(iPos + 1)) ;
//
//	for (auto& duty : duties)
//	{
//		vector<Segment*> segments = duty->getSegments();
//		if (segments.size() <= 1)
//			continue;
//		for (std::size_t i = 1; i < segments.size(); i++)
//		{
//			time_t breakStart = segments[i - 1]->getEndTimeUtcAct();
//			time_t breakEnd = segments[i]->getStartTimeUtcAct();
//			int duration = static_cast<int>(breakEnd - breakStart) / 60;
//			if (duration >= splitDutyTime)
//			{
//				duty->setSplitDuty(true);
//				segments[i - 1]->setSplitDuty(true);
//				duty->splitDutyDurationInMins = max(duty->splitDutyDurationInMins, (int)duration - 30);
//			}
//			else {
//				duty->setSplitDuty(false);
//				segments[i - 1]->setSplitDuty(false);
//			}
//			segments[i - 1]->setTransitDurationMins(duration);
//		}
//	}
//
//}