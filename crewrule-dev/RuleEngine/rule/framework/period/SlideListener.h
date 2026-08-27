#ifndef _NEWRULEENGINE_SLIDELISTENER_H_
#define _NEWRULEENGINE_SLIDELISTENER_H_

class Period;

class SlideListener {

public:
	/**
	* 滑动（滚动）事件
	* @param: next 当前是否继续迭代。true-继续，false-终止
	* @param: ignoreSlide 是否忽略当前滑动（滚动）窗口的处理，true-忽略不继续迭代workPeriod，false-继续
	* @param: period 当前工作时间对象（所在当前滑动（滚动）窗口内）
	* @param: nextPeriod 下一个工作时间对象（所在当前滑动（滚动）窗口内）
	* @param: windowStartLoc 当前滑动（滚动）窗口开始时间
	* @param: windowEndLoc 当前滑动（滚动）窗口结束时间
	* @param: offsetTZMinutes 时区差（分钟数），与UTC时区的时差
	* @param: slideUnit 滑动（滚动）窗口时间单位，RH-按小时滑动（滚动），CD-按天滑动（滚动）
	* @return: 返回处理标志，true-成功，false-失败
	*/
	virtual bool OnSlide(bool& next, bool& ignoreSlide, const Period* period, const Period* nextPeriod, const time_t windowStartLoc, const time_t windowEndLoc, int offsetTZMinutes, void* params, ...) const = 0;
};

#endif //_NEWRULEENGINE_SLIDELISTENER_H_