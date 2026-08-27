#ifndef TimeWindowH
#define TimeWindowH

#include <vector>

using namespace std;

class TimeWindow
{
public:
	TimeWindow(long st,long et);
	~TimeWindow(){}; 

private:
	long startTime = 0;
	long endTime = 0;
};

#endif