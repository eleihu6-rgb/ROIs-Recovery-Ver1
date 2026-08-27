#ifndef CREW_MONTH_MANDAY_H
#define CREW_MONTH_MANDAY_H
#include <string>

//------------- Calculation_Manday ---------------
struct CrewMonthManday {
	std::string crewId;
	std::string month;
	int blh = 0;			//by minute
	int fdp = 0;			//by minute
	int dp = 0;				//by minute
	int highPlateau = 0;	//unknonw
	
};

#endif//CREW_MONTH_MANDAY_H