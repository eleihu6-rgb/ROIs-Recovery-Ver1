#include "SlideWindow.h"

#include <algorithm>
#include "Period.h"
#include "SlideListener.h"
#include "../utils/TimeUtils.h"

inline static unsigned int GetWindowStartAdjustment(const unsigned int windowSize, const std::string& slideUnit, const unsigned int windowSlideSize) {
	if (slideUnit == "CM" || slideUnit == "CD" || slideUnit == "CH" || slideUnit == "CY" || slideUnit == "CW") {
		//不采用滚动，与现有配置不一致，因此暂时不能使用
		return windowSize * windowSlideSize;
	}
	return windowSlideSize;
}

bool SlideWindow::Slide(const time_t startTimeUtc, const time_t endTimeUtc, int offsetTZMinutes, 
	const std::vector<std::unique_ptr<Period>>& periods,
	const unsigned int windowSize, const std::string& slideUnit, const SlideListener& slideListener, void* params, ...)  const {
	bool isAllValid = true;

	//获得滑动窗口步长（单位秒），(按小时或按天滑动 转成秒)
	unsigned int windowSlideSize = GetWindowSlideSize(slideUnit);

	time_t fixedStartTimeLoc = TimeUtils::Floor(startTimeUtc + offsetTZMinutes * 60, TimeUtils::FromSlideUnit(slideUnit));
	time_t fixedEndTimeLoc = TimeUtils::Ceil(endTimeUtc + offsetTZMinutes * 60, TimeUtils::FromSlideUnit(slideUnit));

	std::size_t startIndex = 0;
	bool next = true;
	//windowStart 窗口开始时间，windowEnd 窗口结束时间
	//for (time_t windowStartLoc = fixedStartTimeLoc; windowStartLoc < fixedEndTimeLoc; windowStartLoc += GetWindowStartAdjustment(windowSize, slideUnit, windowSlideSize)) {
	for (time_t windowStartLoc = fixedStartTimeLoc; windowStartLoc < fixedEndTimeLoc; windowStartLoc += windowSlideSize) {
		time_t windowEndLoc = windowStartLoc + windowSize * windowSlideSize;

		//检查滑动窗口[windowStart,windowEnd]是否违规
		bool isValid = Slide(startIndex, next, periods, windowStartLoc, windowEndLoc, offsetTZMinutes, windowSlideSize, slideListener, params);
		if (!isValid) {
			//违规则记录，存在违规
			isAllValid = false;
		}
		if (!next) {
			//不在继续，则退出
			break;
		}

	}
	return isAllValid;
}

int SlideWindow::GetWindowSlideSize(const std::string& slideUnit) {
	if (slideUnit == "RH" || slideUnit == "AH") {
		return 60 * 60;
	}
	else if (slideUnit == "CD") {
		return 24 * 60 * 60;
	}
	return -1;
}

bool SlideWindow::Slide(std::size_t& startIndex, bool& next, const std::vector<std::unique_ptr<Period>>& periods,
	const time_t windowStartLoc, const time_t windowEndLoc, int offsetTZMinutes, const time_t windowSlideSize, const SlideListener& slideListener, void* params, ...) const {

	bool isValid = true;
	bool changedStart = false;
	bool ignoreSlide = false;//忽略当前滑动窗口
	for (std::size_t i = startIndex; i < periods.size(); i++) {
		Period* currPeriod = periods[i].get();
		Period* nextPeriod = ((i + 1) >= periods.size()) ? nullptr : periods[i + 1].get();
		if ( i >= startIndex && !changedStart && 
			(((windowStartLoc + windowSlideSize) <= (currPeriod->GetEndTimeUTC() + offsetTZMinutes * 60) && (currPeriod->GetEndTimeUTC() + offsetTZMinutes * 60) <= (windowStartLoc + 2* windowSlideSize))
			 || ((windowStartLoc + windowSlideSize) <= (currPeriod->GetStartTimeUTC() + offsetTZMinutes * 60 ) && (currPeriod->GetStartTimeUTC() + offsetTZMinutes * 60) <= (windowStartLoc + 2 * windowSlideSize)))
			) {
			startIndex = i;
			changedStart = true;
		}

		if ((currPeriod->GetStartTimeUTC() + offsetTZMinutes*60) > windowEndLoc) {
			//开始时间超出滑动窗口范围，则退出
			break;
		}

		//当前workPeriod在滚动窗口范围内。
		if (IsSlideWindow(*currPeriod, windowStartLoc, windowEndLoc, offsetTZMinutes)) {
			//int consecutiveMinutesPerPeriod = nextWorkPeriod->GetStartTimeUTC() - currWorkPeriod->GetEndTimeUTC();
			//if (consecutiveMinutesPerPeriod < 0) {
			//	//spdlog::error("error consecutiveMinutesPerPeriod:{}", consecutiveMinutesPerPeriod);
			//	continue;
			//}
			//TODO 回调
			bool successed = slideListener.OnSlide(next, ignoreSlide, currPeriod, nextPeriod, windowStartLoc, windowEndLoc, offsetTZMinutes, params);
			if (!successed) {
				isValid = false;
			}
			if (ignoreSlide) {
				break;
			}
			if (!next) {
				break;
			}
		}
	}
	return isValid;
}

bool SlideWindow::IsSlideWindow(const Period& period, const time_t windowStartLoc, const time_t windowEndLoc, int offsetTZMinutes) const {
	//使用结束时间在滚动时间窗口中来判断是否在滑动窗口内是合适？？？？
	return (period.GetEndTimeUTC() + offsetTZMinutes*60) >= windowStartLoc && (period.GetEndTimeUTC() + offsetTZMinutes*60)<= windowEndLoc;
}