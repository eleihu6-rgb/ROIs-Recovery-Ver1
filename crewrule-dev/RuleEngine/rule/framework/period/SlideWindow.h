#ifndef _NEWRULEENGINE_SLIDEWINDOW_H_
#define _NEWRULEENGINE_SLIDEWINDOW_H_

#include <ctime>
#include <vector>
#include <string>
#include <memory>

class Period;
class SlideListener;

class SlideWindow {

public:
	/**
	* 滑动（滚动）窗口
	* @param: startTimeUtc 开始时间（时间戳，秒）
	* @param: endTimeUtc 结束时间（时间戳，秒）
	* @param: offsetTZMinutes 时区差（分钟数），与UTC时区的时差
	* @param: periods 工作时间
	* @param: windowSize 窗口大小（分钟数）
	* @param: slideUnit 滑动（滚动）窗口时间单位，RH-按小时滑动（滚动），CD-按天滑动（滚动）
	*/
	bool Slide(const time_t startTimeUtc, const time_t endTimeUtc, int offsetTZMinutes, const std::vector<std::unique_ptr<Period>>& periods,
		const unsigned int windowSize, const std::string& slideUnit, const SlideListener& slideListener, void* params, ...) const;

	//滑动窗口每次滑动大小（单位：秒），比如：按小时、按天
	static int GetWindowSlideSize(const std::string& slideUnit);
private:
	bool Slide(std::size_t& startIndex, bool& next, const std::vector<std::unique_ptr<Period>>& periods,
		const time_t windowStartLoc, const time_t windowEndLoc, int offsetTZMinutes, const time_t windowSlideSize, const SlideListener& slideListener, void* params, ...) const;

	bool IsSlideWindow(const Period& period, const time_t windowStartLoc, const time_t windowEndLoc, int offsetTZMinutes) const;


};

#endif //_NEWRULEENGINE_SLIDEWINDOW_H_


