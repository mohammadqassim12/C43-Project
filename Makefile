CXX = g++

CXXFLAGS = -std=c++11 -Wall -O3

INCLUDES = -I/usr/local/include -I/usr/local/opt/libpq/include
LIBS = -L/usr/local/lib -lpqxx -lpq

SRCS = pgsample.cpp
TARGET = pgsample

all: $(TARGET)

$(TARGET): $(SRCS)
	$(CXX) $(CXXFLAGS) $(INCLUDES) -o $(TARGET) $(SRCS) $(LIBS)

clean:
	rm -f $(TARGET)
